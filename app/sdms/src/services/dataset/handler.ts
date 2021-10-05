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


import { Request as expRequest, Response as expResponse } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DatasetModel } from '.';
import { Auth } from '../../auth';
import { Config, JournalFactoryTenantClient, LoggerFactory, StorageFactory } from '../../cloud';
import { DESStorage, DESUtils } from '../../dataecosystem';
import { DESUserAssociation } from '../../dataecosystem/user-association';
import { Error, Feature, FeatureFlags, Params, Response, Utils } from '../../shared';
import { SubProjectDAO, SubProjectModel } from '../subproject';
import { TenantDAO, TenantModel } from '../tenant';
import { DatasetDAO } from './dao';
import { IWriteLockSession, Locker } from './locker';
import { DatasetOP } from './optype';
import { DatasetParser } from './parser';

export class DatasetHandler {

    // handler for the [ /dataset ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: DatasetOP) {

        try {
            const tenant = await TenantDAO.get(req.params.tenantid);
            const subproject = await SubProjectDAO.get(
                JournalFactoryTenantClient.get(tenant), req.params.tenantid, req.params.subprojectid);

            if (op === DatasetOP.CheckCTag) {
                Response.writeOK(res, await this.checkCTag(req, subproject));
            } else if (op === DatasetOP.Register) {
                Response.writeOK(res, await this.register(req, tenant, subproject));
            } else if (op === DatasetOP.Get) {
                Response.writeOK(res, await this.get(req, tenant, subproject));
            } else if (op === DatasetOP.List) {
                Response.writeOK(res, await this.list(req, tenant, subproject));
            } else if (op === DatasetOP.Delete) {
                Response.writeOK(res, await this.delete(req, tenant, subproject));
            } else if (op === DatasetOP.Patch) {
                Response.writeOK(res, await this.patch(req, tenant, subproject));
            } else if (op === DatasetOP.Lock) {
                Response.writeOK(res, await this.lock(req, tenant, subproject));
            } else if (op === DatasetOP.UnLock) {
                Response.writeOK(res, await this.unlock(req, tenant, subproject));
            } else if (op === DatasetOP.Exists) {
                Response.writeOK(res, await this.exists(req, tenant, subproject));
            } else if (op === DatasetOP.Sizes) {
                Response.writeOK(res, await this.sizes(req, tenant, subproject));
            } else if (op === DatasetOP.Permission) {
                Response.writeOK(res, await this.checkPermissions(req, tenant, subproject));
            } else if (op === DatasetOP.ListContent) {
                Response.writeOK(res, await this.listContent(req, tenant, subproject));
            } else if (op === DatasetOP.PutTags) {
                Response.writeOK(res, await this.putTags(req, tenant, subproject));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) {
            Response.writeError(res, error);
        }

    }

    private static async checkCTag(req: expRequest, subproject: SubProjectModel): Promise<boolean> {

        // parse user request
        const userInput = DatasetParser.checkCTag(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get({
            gcpid: userInput.tenantID, esd: userInput.dataPartitionID, default_acls: 'any', name: 'any'
        });

        const datasetOUT = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, userInput.dataset) :
            (await DatasetDAO.get(journalClient, userInput.dataset))[0];

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND, 'The dataset ' +
                Config.SDPATHPREFIX + userInput.dataset.tenant + '/' +
                userInput.dataset.subproject + userInput.dataset.path +
                userInput.dataset.name + ' does not exist'));
        }

        // return the cTag check validation
        return datasetOUT.ctag === userInput.dataset.ctag;
    }

    // register a new dataset
    private static async register(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // parse the user input and create the dataset metadata model
        const userInput = await DatasetParser.register(req);
        const dataset = userInput[0];
        const seismicmeta = userInput[1];
        let writeLockSession: IWriteLockSession;

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const journalClientTransaction = journalClient.getTransaction();

        try {

            await journalClientTransaction.run();

            if (dataset.acls) {
                const subprojectMetadata = await SubProjectDAO.get(journalClient, tenant.name, subproject.name);
                const subprojectAccessPolicy = subprojectMetadata.access_policy;

                if (subprojectAccessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                    throw Error.make(Error.Status.BAD_REQUEST,
                        'Subproject access policy is set to uniform and so ACLs cannot be applied. Patch the subproject access policy to dataset and attempt this operation again.');
                }
            }

            // attempt to acquire a mutex on the dataset name and set the lock for the dataset in redis
            // a mutex is applied on the resource on the shared cache (removed at the end of the method)
            const datasetLockKey = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
            writeLockSession = await Locker.createWriteLock(
                datasetLockKey, req.headers['x-seismic-dms-lockid'] as string);

            // if the call is idempotent return the dataset value
            if (writeLockSession.idempotent) {
                const alreadyRegisteredDataset = subproject.enforce_key ?
                    await DatasetDAO.getByKey(journalClient, dataset, journalClientTransaction) :
                    (await DatasetDAO.get(journalClientTransaction, dataset))[0];
                if (alreadyRegisteredDataset) {
                    await Locker.removeWriteLock(writeLockSession, true); // Keep the lock session
                    return alreadyRegisteredDataset;
                }
            }

            // set gcs URL and LegalTag with the subproject information
            dataset.gcsurl = subproject.gcs_bucket + '/' + uuidv4();
            dataset.ltag = dataset.ltag || subproject.ltag;

            // ensure that a legal tag exist
            if (!dataset.ltag) {
                throw Error.make(Error.Status.NOT_FOUND,
                    'No legal-tag has been found for the subproject resource ' +
                    Config.SDPATHPREFIX + dataset.tenant + '/' + dataset.subproject +
                    ' the storage metadata cannot be updated without a valid a legal-tag');
            }

            // check if has read access, if legal tag is valid, and if the dataset does not already exist
            await Promise.all([
                FeatureFlags.isEnabled(Feature.AUTHORIZATION) ?
                    Auth.isWriteAuthorized(req.headers.authorization,
                        subproject.acls.admins,
                        tenant, dataset.subproject, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string) : undefined,
                FeatureFlags.isEnabled(Feature.LEGALTAG) ?
                    dataset.ltag ? Auth.isLegalTagValid(
                        req.headers.authorization, dataset.ltag,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined : undefined,
            ]);

            const datasetAlreadyExist = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, dataset, journalClientTransaction) :
                (await DatasetDAO.get(journalClientTransaction, dataset))[0];

            // check if dataset already exist
            if (datasetAlreadyExist) {
                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
                    dataset.subproject + dataset.path + dataset.name +
                    ' already exists'));
            }

            // Populate the storage record with other mandatory field if not supplied.
            if (seismicmeta) {

                // if id is given, take it. otherwise generate
                if (!seismicmeta.id) {
                    dataset.seismicmeta_guid = DESUtils.getDataPartitionID(tenant.esd) + seismicmeta.recordType
                        + Utils.makeID(16);
                    seismicmeta.id = dataset.seismicmeta_guid;
                } else {
                    dataset.seismicmeta_guid = seismicmeta.id;
                }

                // remove the recordType attribute as guid is now computed
                delete seismicmeta.recordType;

                // if acl is given, take it. otherwise generate
                if (!seismicmeta.acl) {
                    seismicmeta.acl = {
                        owners: ['data.default.owners@' + tenant.esd],
                        viewers: ['data.default.viewers@' + tenant.esd],
                    };
                }

                // [TO REVIEW]
                // wrt legaltags, there is a field 'otherRelevantDataCountries' that will have to considered
                // for now force it to US, if does not exist. To review before complete PR

                // this could be included as default in the request
                if (!seismicmeta.legal) {
                    seismicmeta.legal = {
                        legaltags: [dataset.ltag],
                        otherRelevantDataCountries: ['US'],
                    };
                }

            }


            // prepare the keys
            const datasetEntityKey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: subproject.enforce_key ? (dataset.path.slice(0, -1) + '/' + dataset.name) : undefined
            });

            // save the dataset entity
            await Promise.all([
                DatasetDAO.register(journalClientTransaction, { key: datasetEntityKey, data: dataset }),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization,
                        [seismicmeta], tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            // release the mutex and keep the lock session
            await Locker.removeWriteLock(writeLockSession, true);
            await journalClientTransaction.commit();

            // attach the gcpid for fast check
            dataset.ctag = dataset.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

            // attach locking information
            dataset.sbit = writeLockSession.wid;
            dataset.sbit_count = 1;

            return dataset;

        } catch (err) {

            // release the mutex and unlock the resource
            await Locker.removeWriteLock(writeLockSession);
            await journalClientTransaction.rollback();
            throw (err);

        }

    }

    // retrieve the dataset metadata
    private static async get(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // parse user request
        const userInput = DatasetParser.get(req);
        const datasetIN = userInput[0];
        const convertSubIdToEmail = (userInput[2] !== undefined) ? userInput[2] : true;

        // retrieve journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const datasetOUT = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetIN) :
            (await DatasetDAO.get(journalClient, datasetIN))[0];

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // Check if retrieve the seismic metadata storage record
        const getSeismicMeta = datasetOUT.seismicmeta_guid !== undefined && userInput[1];

        // Check if legal tag is valid
        if (FeatureFlags.isEnabled(Feature.LEGALTAG) && datasetOUT.ltag) {
            await Auth.isLegalTagValid(req.headers.authorization, datasetOUT.ltag,
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }


        // Use the access policy to determine which groups to fetch for read authorization
        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            let authGroups = [];
            if (subproject.access_policy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.viewers.concat(subproject.acls.admins);
            } else if (subproject.access_policy === Config.DATASET_ACCESS_POLICY) {
                authGroups = datasetOUT.acls ? datasetOUT.acls.viewers.concat(datasetOUT.acls.admins)
                    : subproject.acls.viewers.concat(subproject.acls.admins);
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'Access policy for the subproject is neither uniform nor dataset'));
            }
            await Auth.isReadAuthorized(req.headers.authorization, authGroups,
                tenant, datasetIN.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // Convert subid to email if userinput query param subid_to_email is true
        if (FeatureFlags.isEnabled(Feature.CCM_INTERACTION) && convertSubIdToEmail) {
            if (!Utils.isEmail(datasetOUT.created_by)) {
                const dataPartition = DESUtils.getDataPartitionID(tenant.esd);
                const userEmail = await DESUserAssociation.convertSubIdToEmail
                    (req[Config.DE_FORWARD_APPKEY], datasetOUT.created_by, dataPartition);
                datasetOUT.created_by = userEmail;
            }

        }

        // return the seismicmetadata (if exist)
        if (getSeismicMeta) {
            const seismicMeta = await DESStorage.getRecord(req.headers.authorization, datasetOUT.seismicmeta_guid,
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            if (seismicMeta) {
                (datasetOUT as any).seismicmeta = seismicMeta;
            }
        }

        // attach the gcpid for fast check
        datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

        return datasetOUT;

    }

    // list the datasets in a subproject
    private static async list(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const userInput = DatasetParser.list(req);

        const dataset = userInput.dataset;
        const pagination = userInput.pagination;

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                tenant, dataset.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // Retrieve the list of datasets metadata
        const output = await DatasetDAO.list(journalClient, dataset, pagination) as any;

        // attach the gcpid for fast check
        for (const item of output.datasets) {
            item.ctag = item.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);
        }


        // Retrieve the list of datasets metadata
        if (output.nextPageCursor) {
            return output;
        }

        return output.datasets;
    }

    // delete a dataset
    private static async delete(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const datasetIn = DatasetParser.delete(req);
        const lockKey = datasetIn.tenant + '/' + datasetIn.subproject + datasetIn.path + datasetIn.name;

        // ensure is not write locked
        if (!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            if (Locker.isWriteLock(await Locker.getLock(lockKey))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIn.tenant + '/' +
                    datasetIn.subproject + datasetIn.path + datasetIn.name + ' is write locked ' +
                    Error.get423WriteLockReason()));
            }
        }

        // init datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const dataset = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetIn) :
            (await DatasetDAO.get(journalClient, datasetIn))[0];

        // if the dataset does not exist return ok
        if (!dataset) { return; }

        // check authorization (write)
        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            let authGroups = [];
            const accessPolicy = subproject.access_policy;

            if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.admins;
            } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                authGroups = dataset.acls ? dataset.acls.admins : subproject.acls.admins;
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'Access policy for the subproject is neither uniform nor dataset'));
            }

            await Auth.isWriteAuthorized(req.headers.authorization,
                authGroups, tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // check if valid url
        if (!dataset.gcsurl || dataset.gcsurl.indexOf('/') === -1) {
            throw (Error.make(Error.Status.UNKNOWN,
                'The dataset ' + Config.SDPATHPREFIX + datasetIn.tenant + '/' +
                datasetIn.subproject + datasetIn.path + datasetIn.name +
                ' cannot be deleted as it does not have a valid gcs url in the metadata catalogue.'));
        }

        // Delete the dataset metadata (both firestore and DEStorage)
        await Promise.all([
            // delete the dataset entity
            DatasetDAO.delete(journalClient, dataset),
            // delete des storage record
            (dataset.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                DESStorage.deleteRecord(req.headers.authorization,
                    dataset.seismicmeta_guid, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
        ]);

        // Delete all physical objects (not wait for full objects deletion)
        const bucketName = dataset.gcsurl.split('/')[0];
        const gcsPrefix = dataset.gcsurl.split('/')[1];
        const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
        // tslint:disable-next-line: no-floating-promises no-console
        storage.deleteObjects(bucketName, gcsPrefix).catch((error) => {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error));
        });

        // remove any remaining locks (this should be removed with SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS)
        const datasetLockKey = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        await Locker.unlock(datasetLockKey);

    }

    // patch the dataset metadata
    private static async patch(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const [datasetIN, seismicmeta, newName, wid] = DatasetParser.patch(req);
        const lockKey = datasetIN.tenant + '/' + datasetIN.subproject + datasetIN.path + datasetIN.name;

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // return immediately if it is a simple close with empty body (no patch to apply)
        if (Object.keys(req.body).length === 0 && req.body.constructor === Object && wid) {

            // Check authorizations
            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                if (wid.startsWith('W')) {
                    await Auth.isWriteAuthorized(req.headers.authorization,
                        subproject.acls.admins,
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                } else {
                    await Auth.isReadAuthorized(req.headers.authorization,
                        subproject.acls.viewers.concat(subproject.acls.admins),
                        tenant, datasetIN.subproject, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string);
                }
            }

            // Retrieve the dataset metadata
            const dataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetIN) :
                (await DatasetDAO.get(journalClient, datasetIN))[0];

            // check if the dataset does not exist
            if (!dataset) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }

            // unlock the dataset
            const unlockRes = await Locker.unlock(lockKey, wid);
            dataset.sbit = unlockRes.id;
            dataset.sbit_count = unlockRes.cnt;

            return dataset;
        }

        // Ensure subproject access policy is not set to uniform
        if (datasetIN.acls) {
            const subprojectMetadata = await SubProjectDAO.get(journalClient, tenant.name, subproject.name);
            const subprojectAccessPolicy = subprojectMetadata.access_policy;

            if (subprojectAccessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                throw Error.make(Error.Status.BAD_REQUEST,
                    'Subproject access policy is set to uniform and so the dataset ACLs cannot be applied. Patch the subproject access policy to dataset and attempt this operation again.');
            }
        }

        // unlock the dataset for close operation (and patch)
        const lockres = wid ? await Locker.unlock(lockKey, wid) : { id: null, cnt: 0 };

        // ensure nobody got the lock between the close and the mutex acquisition
        if (!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            if (Locker.isWriteLock(await Locker.getLock(lockKey))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' is write locked ' +
                    Error.get423WriteLockReason()));
            }
        }

        // Retrieve the dataset metadata
        let datasetOUT: DatasetModel;
        let datasetOUTKey: any;
        if (subproject.enforce_key) {
            datasetOUT = await DatasetDAO.getByKey(journalClient, datasetIN);
            datasetOUTKey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + datasetIN.tenant + '-' + datasetIN.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: datasetIN.path.slice(0, -1) + '/' + datasetIN.name
            });
        } else {
            const results = await DatasetDAO.get(journalClient, datasetIN);
            datasetOUT = results[0];
            datasetOUTKey = results[1];
        }

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // If the input request has dataset ACLs then the subproject access policy is always dataset
        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            let authGroups = [];
            const accessPolicy = subproject.access_policy;

            if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.admins;
            } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                authGroups = datasetOUT.acls ? datasetOUT.acls.admins : subproject.acls.admins;
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED, 'Access policy is neither uniform nor dataset.'
                ));
            }

            await Auth.isWriteAuthorized(req.headers.authorization,
                authGroups, tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // patch datasetOUT with datasetIN
        if (datasetIN.metadata) { datasetOUT.metadata = datasetIN.metadata; }
        if (datasetIN.filemetadata) { datasetOUT.filemetadata = datasetIN.filemetadata; }
        if (datasetIN.last_modified_date) { datasetOUT.last_modified_date = datasetIN.last_modified_date; }
        if (datasetIN.readonly !== undefined) { datasetOUT.readonly = datasetIN.readonly; }
        if (datasetIN.gtags !== undefined && datasetIN.gtags.length > 0) { datasetOUT.gtags = datasetIN.gtags; }
        if (datasetIN.ltag) {
            if (FeatureFlags.isEnabled(Feature.LEGALTAG)) {
                await Auth.isLegalTagValid(
                    req.headers.authorization, datasetIN.ltag, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }
            datasetOUT.ltag = datasetIN.ltag;
        }

        if (newName) {
            if (newName === datasetIN.name) {
                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + newName + ' already exists'));
            }

            datasetIN.name = newName;

            const datasetAlreadyExist = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetIN) :
                (await DatasetDAO.get(journalClient, datasetIN))[0];

            // check if dataset already exist
            if (datasetAlreadyExist) {
                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + newName + ' already exists'));
            }

            if (subproject.enforce_key) {
                datasetOUTKey = journalClient.createKey({
                    namespace: Config.SEISMIC_STORE_NS + '-' + datasetIN.tenant + '-' + datasetIN.subproject,
                    path: [Config.DATASETS_KIND],
                    enforcedKey: datasetIN.path.slice(0, -1) + '/' + datasetIN.name
                });
            }

            datasetOUT.name = newName;
        }

        // Populate the storage record with other mandatory field if not supplied.
        let seismicmetaDE: any;
        if (seismicmeta) {

            // return the seismicmetadata (if exists)
            if (datasetOUT.seismicmeta_guid) {

                // seismicmeta is already there, need to patch
                seismicmetaDE = await DESStorage.getRecord(
                    req.headers.authorization, datasetOUT.seismicmeta_guid,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]);

                for (const keySeismicMeta of Object.keys(seismicmeta)) {
                    seismicmetaDE[keySeismicMeta] = seismicmeta[keySeismicMeta];
                }

                datasetOUT.seismicmeta_guid = seismicmeta.id;

            } else {

                // mandatory field required if a new seismic metadata record is ingested (kind/data required)
                Params.checkString(seismicmeta.kind, 'kind');
                Params.checkObject(seismicmeta.data, 'data');

                // {data-partition(delfi)|authority(osdu)}.{source}.{entityType}.{semanticSchemaVersion}
                if ((seismicmeta.kind as string).split(':').length !== 4) {
                    throw (Error.make(Error.Status.BAD_REQUEST, 'The seismicmeta kind is in a wrong format'));
                }

                // (recordType == entityType)
                seismicmeta.recordType = ':' + (seismicmeta.kind as string).split(':')[2] + ':';

                // if id is given, take it. otherwise generate
                if (!seismicmeta.id) {
                    datasetOUT.seismicmeta_guid = DESUtils.getDataPartitionID(tenant.esd)
                        + seismicmeta.recordType + Utils.makeID(16);
                    seismicmeta.id = datasetOUT.seismicmeta_guid;
                } else {
                    datasetOUT.seismicmeta_guid = seismicmeta.id;
                }

                // remove the recordType attribute as guid is now computed
                delete seismicmeta.recordType;

                // if acl is given, take it. otherwise generate
                if (!seismicmeta.acl) {
                    seismicmeta.acl = {
                        owners: ['data.default.owners@' + tenant.esd],
                        viewers: ['data.default.viewers@' + tenant.esd],
                    };
                }

                // [TO REVIEW]
                // wrt legaltags, there is a field 'otherRelevantDataCountries' that will have to considered
                // for now force it to US, if does not exist. To review before complete PR

                // this could be included as default in the request
                if (!seismicmeta.legal) {

                    // ensure that a legal tag exist
                    if (!datasetOUT.ltag) {

                        throw (!subproject.ltag ?
                            Error.make(Error.Status.NOT_FOUND,
                                'No legal-tag has been found for the subproject resource ' +
                                Config.SDPATHPREFIX + datasetIN.tenant + '/' + datasetIN.subproject +
                                ' the storage metadata cannot be updated without a valid legal-tag') :
                            Error.make(Error.Status.NOT_FOUND,
                                'No legal-tag has been found on the dataset resource ' +
                                Config.SDPATHPREFIX + datasetIN.tenant + '/' + datasetIN.subproject +
                                datasetIN.path + datasetIN.name +
                                ' the storage metadata cannot be updated without a valid legal-tag'));
                    }

                    // insert legal tag
                    seismicmeta.legal = {
                        legaltags: [datasetOUT.ltag],
                        otherRelevantDataCountries: ['US'],
                    };
                }

                seismicmetaDE = seismicmeta;
            }
        }

        // Update the ACLs if the input request has them
        if (datasetIN.acls) {
            datasetOUT.acls = datasetIN.acls;
        }

        if (newName) {
            await Promise.all([
                DatasetDAO.delete(journalClient, datasetOUT),
                DatasetDAO.register(journalClient, { key: datasetOUTKey, data: datasetOUT }),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE)))
                    ? DESStorage.insertRecord(req.headers.authorization, [seismicmetaDE],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined]);
        } else {
            await Promise.all([
                DatasetDAO.update(journalClient, datasetOUT, datasetOUTKey),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE)))
                    ? DESStorage.insertRecord(req.headers.authorization, [seismicmetaDE],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined]);
        }

        // attach lock information
        if (wid) {
            datasetOUT.sbit = lockres.id;
            datasetOUT.sbit_count = lockres.cnt;
        } else {
            const datasetOUTLockKey = datasetOUT.tenant + '/' + datasetOUT.subproject
                + datasetOUT.path + datasetOUT.name;
            const datasetOUTLockRes = await Locker.getLock(datasetOUTLockKey);
            if (datasetOUTLockRes) {
                if (Locker.isWriteLock(datasetOUTLockRes)) {
                    datasetOUT.sbit = datasetOUTLockRes as string;
                    datasetOUT.sbit_count = 1;
                } else {
                    datasetOUT.sbit = (datasetOUTLockRes as string[]).join(':');
                    datasetOUT.sbit_count = datasetOUTLockRes.length;
                }
            }
        }

        // attach the gcpid for fast check
        datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

        return datasetOUT;

    }

    // lock the dataset metadata for opening
    private static async lock(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // parse user request
        const userInput = DatasetParser.lock(req);
        const datasetIN = userInput.dataset;
        const open4write = userInput.open4write;
        const wid = userInput.wid;

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);


        // Retrieve the dataset metadata
        const datasetOUT = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetIN) :
            (await DatasetDAO.get(journalClient, datasetIN))[0];

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // Check if legal tag is valid;
        if (FeatureFlags.isEnabled(Feature.LEGALTAG) && datasetOUT.ltag) {
            await Auth.isLegalTagValid(req.headers.authorization, datasetOUT.ltag,
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // Use the access policy to determine which groups to fetch for read authorization
        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            let authGroups = [];
            const accessPolicy = subproject.access_policy;

            if (open4write) {
                if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                    authGroups = subproject.acls.admins;
                } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                    authGroups = datasetOUT.acls ? datasetOUT.acls.admins : subproject.acls.admins;
                } else {
                    throw (Error.make(Error.Status.PERMISSION_DENIED,
                        'Access policy is neither uniform nor dataset'));
                }

                await Auth.isWriteAuthorized(req.headers.authorization,
                    authGroups, tenant, datasetIN.subproject,
                    req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);

            } else {

                if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                    authGroups = subproject.acls.viewers.concat(subproject.acls.admins);
                } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                    authGroups = datasetOUT.acls ? datasetOUT.acls.viewers.concat(datasetOUT.acls.admins)
                        : subproject.acls.viewers.concat(subproject.acls.admins);
                } else {
                    throw (Error.make(Error.Status.PERMISSION_DENIED,
                        'Access policy is neither uniform nor dataset'));
                }

                await Auth.isReadAuthorized(req.headers.authorization, authGroups,
                    tenant, datasetIN.subproject, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);
            }

        }

        // managing read-only datasets
        if (datasetOUT.readonly) {
            if (open4write) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name +
                    ' cannot be locked (read-only dataset)'));
            } else {
                // attach the gcpid for fast check
                datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);
                return datasetOUT;
            }
        }

        // lock in cache
        const lockKey = datasetIN.tenant + '/' + datasetIN.subproject + datasetIN.path + datasetIN.name;
        const lockres = open4write ?
            await Locker.acquireWriteLock(lockKey, req.headers['x-seismic-dms-lockid'] as string, wid) :
            await Locker.acquireReadLock(lockKey, req.headers['x-seismic-dms-lockid'] as string, wid);

        // attach lock information
        datasetOUT.sbit = lockres.id;
        datasetOUT.sbit_count = lockres.cnt;

        // attach the gcpid for fast check
        datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

        return datasetOUT;

    }

    // unlock the dataset metadata for opening
    private static async unlock(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // parse user request
        const datasetIN = DatasetParser.unlock(req);

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const dataset = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetIN) :
            (await DatasetDAO.get(journalClient, datasetIN))[0];


        // check if the dataset does not exist
        const lockKey = datasetIN.tenant + '/' + datasetIN.subproject + datasetIN.path + datasetIN.name;
        if (!dataset) {
            if (await Locker.getLock(lockKey)) {
                // if a previous call fails, the dataset is not created but the lock is acquired and not released
                await Locker.unlock(lockKey);
                return;
            } else { // the dataset does not exist and is not locked
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }
        }

        // check if user is write authorized
        let authGroups = [];
        const accessPolicy = subproject.access_policy;

        if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
            authGroups = subproject.acls.admins;
        } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
            authGroups = dataset.acls ? dataset.acls.admins : subproject.acls.admins;
        } else {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'Access policy is neither uniform nor dataset'));
        }

        await Auth.isWriteAuthorized(req.headers.authorization,
            authGroups, tenant, dataset.subproject,
            req[Config.DE_FORWARD_APPKEY],
            req.headers['impersonation-token-context'] as string);

        // unlock
        await Locker.unlock(lockKey);

    }

    // check if a list of datasets exist in a subproject
    private static async exists(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const datasets = DatasetParser.exists(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {

            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                tenant, datasets[0].subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // Check if the required datasets exist
        const results: boolean[] = [];
        if (subproject.enforce_key) {
            for (const dataset of datasets) {
                results.push((await DatasetDAO.getByKey(journalClient, dataset)) !== undefined);
            }
        } else {
            for (const dataset of datasets) {
                results.push((await DatasetDAO.get(journalClient, dataset))[0] !== undefined);
            }
        }
        return results;
    }

    // retrieve the dataset size for a list of datasets
    private static async sizes(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const datasets = DatasetParser.sizes(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                tenant, datasets[0].subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // Check if the required datasets exist
        const results: number[] = [];
        if (subproject.enforce_key) {
            for (let dataset of datasets) {
                dataset = await DatasetDAO.getByKey(journalClient, dataset);
                if (dataset === undefined) {
                    results.push(-1);
                    continue;
                }
                results.push(!dataset.filemetadata || !dataset.filemetadata.size ? -1 : dataset.filemetadata.size);
            }
        } else {
            for (let dataset of datasets) {
                dataset = (await DatasetDAO.get(journalClient, dataset))[0];
                if (dataset === undefined) {
                    results.push(-1);
                    continue;
                }
                results.push(!dataset.filemetadata || !dataset.filemetadata.size ? -1 : dataset.filemetadata.size);
            }
        }

        return results;

    }

    // list the path content
    private static async listContent(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset information
        const dataset = DatasetParser.listContent(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                tenant, dataset.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        // list the folder content
        return await DatasetDAO.listContent(journalClient, dataset);

    }

    private static async putTags(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        const datasetIN = DatasetParser.putTags(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // ensure is not write locked
        if (!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            const lockKey = datasetIN.tenant + '/' + datasetIN.subproject + datasetIN.path + datasetIN.name;
            if (Locker.isWriteLock(await Locker.getLock(lockKey))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' is write locked ' +
                    Error.get423WriteLockReason()));
            }
        }

        // Retrieve the dataset metadata
        let datasetOUT: DatasetModel;
        let datasetOUTKey: any;
        if (subproject.enforce_key) {
            datasetOUT = await DatasetDAO.getByKey(journalClient, datasetIN);
            datasetOUTKey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + datasetIN.tenant + '-' + datasetIN.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: datasetIN.path.slice(0, -1) + '/' + datasetIN.name
            });
        } else {
            const results = await DatasetDAO.get(journalClient, datasetIN);
            datasetOUT = results[0];
            datasetOUTKey = results[1];
        }

        // Check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        if (datasetOUT.gtags) {
            if (typeof datasetOUT.gtags === 'string') {
                const originalGtags = datasetOUT.gtags;
                datasetOUT.gtags = [];
                datasetOUT.gtags.push(originalGtags);
            }
            if (typeof datasetIN.gtags === 'string') {
                datasetOUT.gtags.push(datasetIN.gtags);
            } else {
                datasetOUT.gtags = datasetOUT.gtags.concat(datasetIN.gtags);
            }
            datasetOUT.gtags = datasetOUT.gtags.filter((item, index) => datasetOUT.gtags.indexOf(item) === index);
        } else {
            datasetOUT.gtags = datasetIN.gtags;
        }

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {

            let authGroups = [];
            const accessPolicy = subproject.access_policy;

            if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.admins;
            } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                authGroups = datasetOUT.acls ? datasetOUT.acls.admins : subproject.acls.admins;
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'Access policy is neither uniform nor dataset'));
            }

            await Auth.isWriteAuthorized(req.headers.authorization,
                authGroups, tenant, datasetIN.subproject,
                req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);
        }

        await DatasetDAO.update(journalClient, datasetOUT, datasetOUTKey);

    }

    // check the permissions of a user on a dataset
    private static async checkPermissions(req: expRequest, tenant: TenantModel, subproject: SubProjectModel) {

        // Retrieve the dataset path information
        const dataset = DatasetParser.checkPermissions(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // check if the dataset does not exist
        const datasetExist = (subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, dataset) :
            (await DatasetDAO.get(journalClient, dataset))[0]) !== undefined;
        if (!datasetExist) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
                dataset.subproject + dataset.path + dataset.name + ' does not exist'));
        }

        const res = { read: false, write: false, delete: false };

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            let authGroups = [];
            const accessPolicy = subproject.access_policy;

            if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.admins;
            } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                authGroups = dataset.acls ? dataset.acls.admins : subproject.acls.admins;
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED, 'Access policy is neither uniform nor dataset'
                ));
            }

            res.write = await Auth.isWriteAuthorized(req.headers.authorization,
                authGroups, tenant, dataset.subproject,
                req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string, false);


            // Check write authorization
            if (accessPolicy === Config.UNIFORM_ACCESS_POLICY) {
                authGroups = subproject.acls.viewers.concat(subproject.acls.admins);
            } else if (accessPolicy === Config.DATASET_ACCESS_POLICY) {
                authGroups = dataset.acls ? dataset.acls.viewers.concat(dataset.acls.admins)
                    : subproject.acls.viewers.concat(subproject.acls.admins);
            } else {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'Access policy is neither uniform nor dataset'));
            }

            res.read = await Auth.isReadAuthorized(req.headers.authorization, authGroups,
                tenant, dataset.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string, false);

        } else {
            res.write = true;
            res.read = true;
        }
        res.delete = res.write;
        return res;

    }

}
