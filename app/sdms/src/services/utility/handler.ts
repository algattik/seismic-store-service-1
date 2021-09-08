// ============================================================================
// Copyright 2017-2021, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import Bull from 'bull';
import { Request as expRequest, Response as expResponse } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Auth, AuthRoles } from '../../auth';
import { Config, CredentialsFactory, JournalFactoryTenantClient } from '../../cloud';
import { IDESEntitlementGroupModel } from '../../cloud/dataecosystem';
import { SeistoreFactory } from '../../cloud/seistore';
import { StorageJobManager } from '../../cloud/shared/queue';
import { DESEntitlement, DESStorage, DESUtils } from '../../dataecosystem';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { DatasetDAO, DatasetModel } from '../dataset';
import { IWriteLockSession, Locker } from '../dataset/locker';
import { SubProjectDAO } from '../subproject';
import { TenantDAO, TenantGroups } from '../tenant';
import { UtilityOP } from './optype';
import { UtilityParser } from './parser';


export class UtilityHandler {

    // handler for the [ /utility ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: UtilityOP) {

        try {
            if (op === UtilityOP.GCSTOKEN) {
                Response.writeOK(res, await this.getGCSAccessToken(req));
            } else if (op === UtilityOP.LS) {
                Response.writeOK(res, await this.ls(req));
            } else if (op === UtilityOP.CP) {
                const response = await this.cp(req);
                Response.writeOK(res, { 'status': response.status }, response.code);
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }
        } catch (error) { Response.writeError(res, error); }

    }

    // retrieve the gcs access token
    private static async getGCSAccessToken(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.STORAGE_CREDENTIALS)) return {};

        let objectPrefix: string;
        const inputParams = UtilityParser.gcsToken(req);
        const sdPath = inputParams.sdPath;
        const readOnly = inputParams.readOnly;

        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const subproject = await SubProjectDAO.get(journalClient, sdPath.tenant, sdPath.subproject);

        if (Object.keys(inputParams.dataset).length === 0) {
            if (readOnly) {
                await Auth.isReadAuthorized(req.headers.authorization,
                    subproject.acls.viewers.concat(subproject.acls.admins),
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);
            } else {
                await Auth.isWriteAuthorized(req.headers.authorization,
                    subproject.acls.admins,
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);
            }
        } else {
            const dataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, inputParams.dataset) :
                (await DatasetDAO.get(journalClient, inputParams.dataset))[0];

            if (readOnly) {
                if (dataset.acls) {
                    await Auth.isReadAuthorized(req.headers.authorization,
                        dataset.acls.viewers.concat(dataset.acls.admins),
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                } else {
                    await Auth.isReadAuthorized(req.headers.authorization,
                        subproject.acls.viewers.concat(subproject.acls.admins),
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                }
            } else {
                if (dataset.acls) {
                    await Auth.isReadAuthorized(req.headers.authorization,
                        dataset.acls.admins,
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                } else {
                    await Auth.isReadAuthorized(req.headers.authorization,
                        subproject.acls.admins,
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                }
            }
            objectPrefix = dataset.gcsurl.split('/')[1];
        }

        return await CredentialsFactory.build(Config.CLOUDPROVIDER).getStorageCredentials(
            subproject.tenant, subproject.name,
            subproject.gcs_bucket, readOnly, DESUtils.getDataPartitionID(tenant.esd), objectPrefix);

    }

    // list contents
    private static async ls(req: expRequest) {

        const userInput = UtilityParser.ls(req);
        const sdPath = userInput.sdPath;
        const wmode = userInput.wmode;
        const pagination = userInput.pagination;

        // list accessible tenants for sdpaths <sd://>
        if (!sdPath.tenant) {
            const tenants = await TenantDAO.getAll();
            const parititons = tenants
                .map((t) => DESUtils.getDataPartitionID(t.esd))
                .filter((val, index, self) => self.indexOf(val) === index);

            // Fetch all entitlements for each unique tenant that the user has access to
            const entitlementCalls = [];
            for (const partition of parititons) {
                try {
                    entitlementCalls.push(await DESEntitlement.getUserGroups(
                        req.headers.authorization, partition, req[Config.DE_FORWARD_APPKEY]));
                } catch (error) { continue; }
            }

            // Filter tenants which the user does not belong
            let groups = entitlementCalls.reduce(
                (carry, groupList) => carry.concat(groupList), []) as IDESEntitlementGroupModel[];
            groups = groups.filter(group => this.validateEntitlements(group)); // only valid seismic-dsm group
            const listTenants: string[] = groups.map((group) => {
                return group.name.startsWith(Config.SERVICEGROUPS_PREFIX) ?
                    group.name.split('.')[3] : group.name.split('.')[2];
            }); // tenant name
            return listTenants.filter((item, pos, self) => self.indexOf(item) === pos); // make unique

        }

        // list the tenant subprojects for sdpaths <sd://tenant>
        const tenant = await TenantDAO.get(sdPath.tenant);

        // Create  tenant journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (!sdPath.subproject) {

            const entitlementTenant = DESUtils.getDataPartitionID(tenant.esd);
            let groups = await DESEntitlement.getUserGroups(
                req.headers.authorization, entitlementTenant, req[Config.DE_FORWARD_APPKEY]);

            // Filter tenants which the user does not belong
            groups = groups.filter(group => this.validateEntitlements(group)); // only valid seismic-dsm group
            groups = groups.filter(group => group.name.startsWith( // get both data and service groups
                TenantGroups.serviceGroupPrefix(sdPath.tenant))).concat(
                    groups.filter(group => group.name.startsWith(
                        TenantGroups.dataGroupPrefix(sdPath.tenant))));
            let listSubprojects: string[] = groups.map((group) => { // retrieve the subproject name
                return group.name.startsWith(Config.SERVICEGROUPS_PREFIX) ?
                    group.name.split('.')[4] : group.name.split('.')[3];
            });
            listSubprojects = listSubprojects.filter((item, pos, self) => self.indexOf(item) === pos);

            // Registered subprojects in the journal
            const listRegisteredSubprojects = (
                await SubProjectDAO.list(journalClient, sdPath.tenant)).map(item => item.name);

            // Intersection of two lists above
            return listSubprojects.filter((sp) => listRegisteredSubprojects.includes(sp));

        }

        // list the folder content for sdpaths <sd://tenant/subproject>
        const dataset = {} as DatasetModel;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path || '/';

        const subproject = await SubProjectDAO.get(journalClient, dataset.tenant, dataset.subproject);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            //  Check if user is authorized
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                tenant, sdPath.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        if (pagination) {
            // Retrieve paginated content list
            return await DatasetDAO.paginatedListContent(journalClient, dataset, wmode, pagination);
        }

        // Retrieve complete content list
        const results = await DatasetDAO.listContent(journalClient, dataset, wmode);
        return (
            (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DIRS) ?
                results.directories : []).concat(
                    (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DATASETS) ?
                        results.datasets : []);
    }

    private static validateEntitlements(el: IDESEntitlementGroupModel): boolean {
        return ((el.name.startsWith(Config.SERVICEGROUPS_PREFIX) || el.name.startsWith(Config.DATAGROUPS_PREFIX)) &&
            (el.name.endsWith(AuthRoles.admin) || el.name.endsWith(AuthRoles.editor)
                || el.name.endsWith(AuthRoles.viewer)));
    }
    // copy datasets (same tenancy required)
    private static async cp(req: expRequest) {

        enum TransferStatus {
            InProgress = 'InProgress',
            Completed = 'Completed',
            Aborted = 'Aborted'
        }

        const userInputs = UtilityParser.cp(req);
        const sdPathFrom = userInputs.sdPathFrom;
        const sdPathTo = userInputs.sdPathTo;
        let copyJob: Bull.Job;
        let preRegisteredDataset: DatasetModel;
        let writeLockSession: IWriteLockSession;

        const tenant = await TenantDAO.get(sdPathFrom.tenant);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // retrieve the destination subproject info
        const subproject = await SubProjectDAO.get(journalClient, sdPathTo.tenant, sdPathTo.subproject);

        // retrieve the source dataset
        let datasetFrom = {} as DatasetModel;
        datasetFrom.tenant = sdPathFrom.tenant;
        datasetFrom.subproject = sdPathFrom.subproject;
        datasetFrom.path = sdPathFrom.path;
        datasetFrom.name = sdPathFrom.dataset;

        // Retrieve the dataset metadata
        datasetFrom = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetFrom) :
            (await DatasetDAO.get(journalClient, datasetFrom))[0];

        // check if the dataset does not exist
        if (!datasetFrom) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                sdPathFrom.path + sdPathFrom.dataset + ' does not exist exist'));
        }

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {

            if (datasetFrom.acls) {
                await Auth.isReadAuthorized(req.headers.authorization,
                    datasetFrom.acls.viewers.concat(datasetFrom.acls.admins),
                    tenant, sdPathFrom.subproject, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);

            } else {
                await Auth.isReadAuthorized(req.headers.authorization,
                    subproject.acls.viewers.concat(subproject.acls.admins),
                    tenant, sdPathFrom.subproject, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);
            }
            // check if has write access on destination dataset and read access on the source subproject
            await Auth.isWriteAuthorized(req.headers.authorization,
                subproject.acls.admins,
                tenant, sdPathTo.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);

        }

        let seismicmeta: any;

        if (datasetFrom.seismicmeta_guid) {

            seismicmeta = await DESStorage.getRecord(req.headers.authorization, datasetFrom.seismicmeta_guid,
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            const guid = datasetFrom.seismicmeta_guid;
            const splitArray = guid.split(':');
            splitArray.pop();
            const guidSubString = splitArray.join(':');
            seismicmeta.id = guidSubString + ':' + Utils.makeID(16);
        }

        // build the destination dataset metadata
        const datasetTo = JSON.parse(JSON.stringify(datasetFrom)) as DatasetModel;
        datasetTo.tenant = sdPathTo.tenant;
        datasetTo.subproject = sdPathTo.subproject;
        datasetTo.name = sdPathTo.dataset;
        datasetTo.path = sdPathTo.path;
        datasetTo.last_modified_date = new Date().toString();
        datasetTo.gcsurl = subproject.gcs_bucket + '/' + uuidv4();
        datasetTo.ltag = datasetTo.ltag || subproject.ltag;
        datasetTo.sbit = Utils.makeID(16);
        datasetTo.sbit_count = 1;
        datasetTo.seismicmeta_guid = datasetFrom.seismicmeta_guid ? seismicmeta.id : undefined;
        datasetTo.transfer_status = TransferStatus.InProgress;

        if (datasetFrom.acls) {
            datasetTo.acls = datasetFrom.acls;
        }

        try {

            // check if a copy is already in progress from a previous request
            const lockKeyTo = datasetTo.tenant + '/' + datasetTo.subproject + datasetTo.path + datasetTo.name;
            const toDatasetLock = await Locker.getLock(lockKeyTo);

            preRegisteredDataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetTo) :
                (await DatasetDAO.get(journalClient, datasetTo))[0];

            if (toDatasetLock && Locker.isWriteLock(toDatasetLock)) {

                if (preRegisteredDataset && 'transfer_status' in preRegisteredDataset &&
                    preRegisteredDataset.transfer_status === TransferStatus.InProgress) {
                    return {
                        'status': 'Copy operation is already in progress..',
                        'code': 202
                    };
                }
                else {
                    throw (Error.make(Error.Status.BAD_REQUEST,
                        'The dataset ' + Config.SDPATHPREFIX + sdPathTo.tenant + '/' + sdPathTo.subproject +
                        sdPathTo.path + sdPathTo.dataset + ' is write locked and cannot be copied'));
                }
            }

            if (preRegisteredDataset) {

                if ('transfer_status' in preRegisteredDataset) {
                    return {
                        'status': preRegisteredDataset.transfer_status,
                        'code': preRegisteredDataset.transfer_status === TransferStatus.Aborted ? 500 : 200
                    };
                }

                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' +
                    Config.SDPATHPREFIX + datasetTo.tenant + '/' +
                    datasetTo.subproject + datasetTo.path + datasetTo.name +
                    ' already exists'));
            }

            writeLockSession = await Locker.createWriteLock(lockKeyTo);

            // check if the source can be opened for read (no copy on writelock dataset)
            const lockKeyFrom = datasetFrom.tenant + '/' + datasetFrom.subproject + datasetFrom.path + datasetFrom.name;
            const fromDatasetLock = await Locker.getLock(lockKeyFrom);

            if (fromDatasetLock && Locker.isWriteLock(fromDatasetLock)) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                    sdPathFrom.path + sdPathFrom.dataset + ' is write locked and cannot be copied'));
            }

            // apply the read lock on the source if requested
            let readlock: { id: string, cnt: number; };

            if (userInputs.lock) {
                readlock = await Locker.acquireReadLock(lockKeyFrom);
            }

            if (FeatureFlags.isEnabled(Feature.LEGALTAG)) {
                // Check if legal tag of the source is valid
                if (datasetFrom.ltag) {
                    // [TODO] we should always have ltag. some datasets does not have it (the old ones)
                    await Auth.isLegalTagValid(req.headers.authorization, datasetFrom.ltag,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                }

                // Check if legal tag of the destination is valid
                // [TODO] we should always have ltag. some datasets does not have it (the old ones)
                if (datasetTo.ltag && datasetTo.ltag !== datasetFrom.ltag) {
                    await Auth.isLegalTagValid(req.headers.authorization, datasetTo.ltag,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                }
            }

            const datasetToEntityKey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: subproject.enforce_key ? (datasetTo.path.slice(0, -1) + '/' + datasetTo.name) : undefined
            });

            let storageKeyTo: any;
            if (datasetTo.seismicmeta_guid) {
                storageKeyTo = journalClient.createKey({
                    namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                    path: [Config.SEISMICMETA_KIND, datasetTo.path + datasetTo.name],
                });
            }

            // Register the dataset and lock the source if required
            await Promise.all([
                DatasetDAO.register(journalClient, { key: datasetToEntityKey, data: datasetTo }),
                (datasetTo.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization, [seismicmeta],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            // set the objects prefix
            const bucketFrom = datasetFrom.gcsurl.split('/')[0];
            const prefixFrom = datasetFrom.gcsurl.split('/')[1];
            const bucketTo = datasetTo.gcsurl.split('/')[0];
            const prefixTo = datasetTo.gcsurl.split('/')[1];

            // copy the objects
            const usermail = await SeistoreFactory.build(
                Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, true);
            const RETRY_MAX_ATTEMPTS = 10;

            copyJob = await StorageJobManager.copyJobsQueue.add({
                sourceBucket: bucketFrom,
                destinationBucket: bucketTo,
                datasetFrom,
                datasetTo,
                prefixFrom,
                prefixTo,
                usermail,
                tenant,
                subproject,
                readlockId: readlock ? readlock.id : null
            }, {
                attempts: RETRY_MAX_ATTEMPTS
            });

            // release the mutex but keep the lock
            await Locker.removeWriteLock(writeLockSession, true);

            return {
                'status': 'Copy in progress',
                'code': 202
            };

        } catch (err) {

            await Locker.removeWriteLock(writeLockSession);

            if (copyJob) {
                await copyJob.remove();
            }

            throw (err);
        }
    }

}