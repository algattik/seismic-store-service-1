// ============================================================================
// Copyright 2017-2020, Schlumberger
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

import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthGroups, AuthRoles } from '../../auth';
import { Config, CredentialsFactory, JournalFactoryTenantClient, StorageFactory } from '../../cloud';
import { IDESEntitlementGroupModel } from '../../cloud/dataecosystem';
import { DESEntitlement, DESStorage, DESUtils } from '../../dataecosystem';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { DatasetDAO, DatasetModel } from '../dataset';
import { Locker } from '../dataset/locker';
import { SubProjectDAO, SubprojectGroups } from '../subproject';
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
                Response.writeOK(res, await this.cp(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }
        } catch (error) { Response.writeError(res, error); }

    }

    // retrieve the gcs access token
    private static async getGCSAccessToken(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.STORAGE_CREDENTIALS)) return {};

        const inputParams = UtilityParser.gcsToken(req);
        const sdPath = inputParams.sdPath;
        const readOnly = inputParams.readOnly;

        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + sdPath.tenant,
            path: [Config.SUBPROJECTS_KIND, sdPath.subproject],
        });
        const subproject = await SubProjectDAO.get(journalClient, sdPath.tenant, sdPath.subproject, spkey);

        if (readOnly) {
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(tenant.name, subproject.name),
                tenant.name, subproject.name, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        } else {
            await Auth.isWriteAuthorized(req.headers.authorization,
                SubprojectGroups.getWriteGroups(tenant.name, subproject.name),
                tenant.name, subproject.name, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // [REVERT-DOWNSCOPE] use the getStorageCredentials instead of getUserCredentials  (remove azure selector)
        // return await credentials.getStorageCredentials(subproject.gcs_bucket, readOnly);
        const credentials = CredentialsFactory.build(Config.CLOUDPROVIDER);
        if(Config.CLOUDPROVIDER === 'azure') {
            return await credentials.getUserCredentials(
                DESUtils.getDataPartitionID(tenant.esd) + ';' + subproject.gcs_bucket + (readOnly ? '1' : '0'))
        } else {
            return await credentials.getUserCredentials(
                Utils.getPropertyFromTokenPayload(req.headers.authorization, 'desid') ||
                Utils.getEmailFromTokenPayload(req.headers.authorization));
        }
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

            const uniqueTenants = tenants
                .map((t) => DESUtils.getDataPartitionID(t.esd))
                .filter((val, index, self) => self.indexOf(val) === index);

            // Fetch all entitlements for each unique tenant that the user has access to
            const entitlements = [];
            for (const item of uniqueTenants) {
                try {
                    entitlements.push(await DESEntitlement.getUserGroups(
                        req.headers.authorization, item, req[Config.DE_FORWARD_APPKEY]));
                } catch (error) { continue; }
            }

            // Filter tenants which the user does not belong
            return entitlements
                .map((entitlementList) => entitlementList
                    .filter((el) => this.validateEntitlements(el) &&
                        el.name.startsWith(AuthGroups.seistoreServicePrefix()))
                    .map((el) => el.name.split('.')[3])
                    .filter((item, pos, self) => self.indexOf(item) === pos))
                .reduce((carry, entitlementList) => carry.concat(entitlementList), []);
        }

        // list the tenant subprojects for sdpaths <sd://tenant>
        const tenant = await TenantDAO.get(sdPath.tenant);

        // Create journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (!sdPath.subproject) {

            const entitlementTenant = DESUtils.getDataPartitionID(tenant.esd);
            const groups = await DESEntitlement.getUserGroups(
                req.headers.authorization, entitlementTenant, req[Config.DE_FORWARD_APPKEY]);

            // List of all the subprojects including the ones which were previously deleted
            const allSubProjects =  groups.filter((el) => this.validateEntitlements(el) &&
                el.name.startsWith(TenantGroups.groupPrefix(sdPath.tenant)))
                .map((el) => el.name.split('.')[4])
                .filter((item, pos, self) => self.indexOf(item) === pos);

            // Registered subprojects in the journal
            const registeredSubprojects = (await SubProjectDAO.list(journalClient, sdPath.tenant))
                                            .map(subproject => subproject.name)

            // Intersection of two lists above
            return allSubProjects.filter((subproject) => registeredSubprojects.includes(subproject))

        }

        // list the folder content for sdpaths <sd://tenant/subproject>
        const dataset = {} as DatasetModel;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path || '/';

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            //  Check if user is authorized
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(sdPath.tenant, sdPath.subproject),
                sdPath.tenant, sdPath.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        if (pagination) {
            // Retrieve paginated content list
            return await DatasetDAO.paginatedListContent(journalClient, dataset, pagination);
        }

        // Retrieve complete content list
        const results = await DatasetDAO.listContent(journalClient, dataset, wmode);
        return (
            (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DIRS) ?
                results.directories.map((el) => el.endsWith('/') ? el : el + '/') : []).concat(
                    (wmode === Config.LS_MODE.ALL || wmode === Config.LS_MODE.DATASETS) ?
                        results.datasets : []);
    }

    private static validateEntitlements(el: IDESEntitlementGroupModel): boolean {
        return (el.name.match(/\./g) || []).length === 5 &&
            (el.name.endsWith(AuthRoles.admin) ||
                el.name.endsWith(AuthRoles.editor) ||
                el.name.endsWith(AuthRoles.viewer));
    }

    // copy datasets (same tenancy required)
    private static async cp(req: expRequest) {

        const userInputs = UtilityParser.cp(req);
        const sdPathFrom = userInputs.sdPathFrom;
        const sdPathTo = userInputs.sdPathTo;
        let datasetPathMutex: any;

        const tenant = await TenantDAO.get(sdPathFrom.tenant);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            if (sdPathFrom.subproject === sdPathTo.subproject) {

                // check if has write access on source/destination dataset (same subproject)
                await Auth.isWriteAuthorized(req.headers.authorization,
                    SubprojectGroups.getWriteGroups(sdPathFrom.tenant, sdPathFrom.subproject),
                    sdPathFrom.tenant, sdPathFrom.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            } else {

                // check if has write access on destination dataset and read access on the source subproject
                await Auth.isWriteAuthorized(req.headers.authorization,
                    SubprojectGroups.getWriteGroups(sdPathTo.tenant, sdPathTo.subproject),
                    sdPathTo.tenant, sdPathTo.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                await Auth.isReadAuthorized(req.headers.authorization,
                    SubprojectGroups.getReadGroups(sdPathFrom.tenant, sdPathFrom.subproject),
                    sdPathFrom.tenant, sdPathFrom.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            }
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const transaction = journalClient.getTransaction();

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + sdPathTo.tenant,
            path: [Config.SUBPROJECTS_KIND, sdPathTo.subproject],
        });

        // retrieve the destination subproject info
        const subproject = await SubProjectDAO.get(journalClient, sdPathTo.tenant, sdPathTo.subproject, spkey);

        // retrieve the source dataset
        let datasetFrom = {} as DatasetModel;
        datasetFrom.tenant = sdPathFrom.tenant;
        datasetFrom.subproject = sdPathFrom.subproject;
        datasetFrom.path = sdPathFrom.path;
        datasetFrom.name = sdPathFrom.dataset;
        const datasetModelFrom = await DatasetDAO.get(journalClient, datasetFrom);
        datasetFrom = datasetModelFrom[0];
        const dsFromkey = datasetModelFrom[1];

        // check if the dataset does not exist
        if (!datasetFrom) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                sdPathFrom.path + sdPathFrom.dataset + ' does not exist exist'));
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

        // build the destination dataseat metadata
        const datasetTo = JSON.parse(JSON.stringify(datasetFrom)) as DatasetModel;
        datasetTo.tenant = sdPathTo.tenant;
        datasetTo.subproject = sdPathTo.subproject;
        datasetTo.name = sdPathTo.dataset;
        datasetTo.path = sdPathTo.path;
        datasetTo.last_modified_date = new Date().toString();
        datasetTo.gcsurl = subproject.gcs_bucket + '/' + Utils.makeID(16);
        datasetTo.ltag = datasetTo.ltag || subproject.ltag;
        datasetTo.sbit = Utils.makeID(16);
        datasetTo.sbit_count = 1;
        datasetTo.seismicmeta_guid = datasetFrom.seismicmeta_guid ? seismicmeta.id : undefined;
        const datasetToPath = datasetTo.tenant + '/' + datasetTo.subproject + datasetTo.path + datasetTo.name;

        // check if the source can be opened for read (no copy on writelock dataset)
        const currlock = await Locker.getLockFromModel(datasetFrom);
        if (currlock && Locker.isWriteLock(currlock)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                sdPathFrom.path + sdPathFrom.dataset + ' is write locked and cannot be copied'));
        }

        // apply the read lock on the source if requested
        let readlock: { id: string, cnt: number; };
        if (userInputs.lock) {
            readlock = await Locker.acquireReadLock(journalClient, datasetFrom);
        }

        if (FeatureFlags.isEnabled(Feature.LEGALTAG)) {
            // Check if legal tag of the source is valid
            if (datasetFrom.ltag) { // [TODO] we should always have ltag. some datasets does not have it (the old ones)
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

        // Check if dataset already exists
        if ((await DatasetDAO.get(journalClient, datasetTo))[0]) {
            throw (Error.make(Error.Status.ALREADY_EXISTS,
                'The dataset ' +
                Config.SDPATHPREFIX + datasetTo.tenant + '/' + datasetTo.subproject + datasetTo.path + datasetTo.name +
                ' already exists'));
        }

        try {
            const dsTokey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                path: [Config.DATASETS_KIND],
            });

            let storageKeyTo: any;
            if (datasetTo.seismicmeta_guid) {
                storageKeyTo = journalClient.createKey({
                    namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                    path: [Config.SEISMICMETA_KIND, datasetTo.path + datasetTo.name],
                });
            }

            await transaction.run();

            // lock for write the destination
            datasetPathMutex = await Locker.createWriteLock(datasetTo);

            // Register the dataset and lock the source if required
            await Promise.all([
                DatasetDAO.register(transaction, { key: dsTokey, data: datasetTo }),
                (datasetTo.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization, [seismicmeta],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            // set the objects prefixf
            const bucketFrom = datasetFrom.gcsurl.split('/')[0];
            const prefixFrom = datasetFrom.gcsurl.split('/')[1];
            const bucketTo = datasetTo.gcsurl.split('/')[0];
            const prefixTo = datasetTo.gcsurl.split('/')[1];

            // copy the objects
            const usermail = Utils.getEmailFromTokenPayload(req.headers.authorization);
            const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
            // await GCS.objectsCopy(bucketFrom, prefixFrom, bucketTo, prefixTo, usermail);
            await storage.copy(bucketFrom, prefixFrom, bucketTo, prefixTo, usermail);

            // replace the CDO object
            const CDOName = prefixTo + '/' + Config.FILE_CDO;
            const CDOMex = JSON.stringify({
                gcs_prefix: prefixTo,
                name: Config.SDPATHPREFIX + datasetTo.tenant + '/' +
                    datasetTo.subproject + datasetTo.path + datasetTo.name,
            });
            // await GCS.objectSave(tenant.gcpid, subproject.gcs_bucket, CDOName, CDOMex);
            await storage.saveObject(subproject.gcs_bucket, CDOName, CDOMex);

            // commit transaction and release destination mutex if previously acquired
            await transaction.commit();
            if (datasetPathMutex) {
                await Locker.releaseMutex(datasetPathMutex, datasetToPath);
            }

            // unlock the destination
            await Locker.unlock(journalClient, datasetTo, datasetTo.sbit);

            // remove the read lock on the source if requested
            if (userInputs.lock) {
                await Locker.unlock(journalClient, datasetFrom, readlock.id);
            }

        } catch (err) {
            transaction.rollback();

            if (datasetPathMutex) {
                await Locker.del(datasetToPath);
            }
            throw (err);
        }
    }

}