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
import { Auth } from '../../auth';
import { Config, JournalFactoryTenantClient, StorageFactory } from '../../cloud';
import { DESStorage, DESUtils } from '../../dataecosystem';
import { Cache, Error, Feature, FeatureFlags, Params, Response, Utils } from '../../shared';
import { SubProjectDAO } from '../subproject';
import { TenantDAO, TenantModel } from '../tenant';
import { DatasetDAO } from './dao';
import { Locker, IWriteLockSession } from './locker';
import { DatasetOP } from './optype';
import { DatasetParser } from './parser';
import { v4 as uuidv4 } from 'uuid';
import { DatasetModel } from '.';

export class DatasetHandler {

    // private static _cache: Cache<DatasetModel>;


    // handler for the [ /dataset ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: DatasetOP) {

        // if (!this._cache) {
        //     this._cache = new Cache<DatasetModel>({
        //         ADDRESS: Config.DES_REDIS_INSTANCE_ADDRESS,
        //         PORT: Config.DES_REDIS_INSTANCE_PORT,
        //         KEY: Config.DES_REDIS_INSTANCE_KEY,
        //         DISABLE_TLS: Config.DES_REDIS_INSTANCE_TLS_DISABLE,
        //     }, 'dset')
        // }

        try {

            if (op === DatasetOP.CheckCTag) {
                Response.writeOK(res, await this.checkCTag(req));
            } else {

                // const tenant = await TenantDAO.get(req.params.tenantid);
                const tenant: any = {
                    'esd': 'slb.p4d.cloud.slb-ds.com',
                    'default_acls': 'users.datalake.admins@slb.p4d.cloud.slb-ds.com',
                    'gcpid': 'evd-c4n-us-ssdp-firestore-01',
                    'name': 'k8s'
                }

                if (op === DatasetOP.Register) {
                    Response.writeOK(res, await this.register(req, tenant));
                } else if (op === DatasetOP.Get) {
                    Response.writeOK(res, await this.get(req, tenant));
                } else if (op === DatasetOP.List) {
                    Response.writeOK(res, await this.list(req, tenant));
                } else if (op === DatasetOP.Delete) {
                    Response.writeOK(res, await this.delete(req, tenant));
                } else if (op === DatasetOP.Patch) {
                    Response.writeOK(res, await this.patch(req, tenant));
                } else if (op === DatasetOP.Lock) {
                    Response.writeOK(res, await this.lock(req, tenant));
                } else if (op === DatasetOP.UnLock) {
                    Response.writeOK(res, await this.unlock(req, tenant));
                } else if (op === DatasetOP.Exists) {
                    Response.writeOK(res, await this.exists(req, tenant));
                } else if (op === DatasetOP.Sizes) {
                    Response.writeOK(res, await this.sizes(req, tenant));
                } else if (op === DatasetOP.Permission) {
                    Response.writeOK(res, await this.checkPermissions(req, tenant));
                } else if (op === DatasetOP.ListContent) {
                    Response.writeOK(res, await this.listContent(req, tenant));
                } else if (op === DatasetOP.PutTags) {
                    Response.writeOK(res, await this.putTags(req, tenant));
                } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }
            }

        } catch (error) { Response.writeError(res, error); }

    }

    private static async checkCTag(req: expRequest): Promise<boolean> {

        // parse user request
        const userInput = DatasetParser.checkCTag(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get({
            gcpid: userInput.tenantID, esd: userInput.dataPartitionID, default_acls: 'any', name: 'any'
        });

        // Retrieve the dataset metadata
        const datasetOUT = (await DatasetDAO.get(journalClient, userInput.dataset))[0];

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
    private static async register(req: expRequest, tenant: TenantModel) {

        // parse the user input and create the dataset metadata model
        const userInput = await DatasetParser.register(req);
        const dataset = userInput[0];
        const seismicmeta = userInput[1];
        let writeLockSession: IWriteLockSession;

        const journalClient = JournalFactoryTenantClient.get(tenant);
        // const transaction = journalClient.getTransaction();

        try {

            // await transaction.run();

            // attempt to acquire a mutex on the dataset name and set the lock for the dataset in redis
            // a mutex is applied on the resource on the shared cahce (removed at the end of the method)
            writeLockSession = await Locker.createWriteLock(
                dataset, req.headers['x-seismic-dms-lockid'] as string);

            // if the call is idempotent return the dataset value
            if(writeLockSession.idempotent) {
                const alreadyRegisteredDataset =  (await DatasetDAO.get(journalClient, dataset))[0];
                // const alreadyRegisteredDataset = await this._cache.get(
                    // Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + dataset.tenant + ':' +
                    // dataset.subproject + ':' + dataset.path + ':' + dataset.name);
                // await Locker.removeWriteLock(writeLockSession, true); // Keep the lock session
                return alreadyRegisteredDataset;
            }

            // const spkey = journalClient.createKey({
                // namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                // path: [Config.SUBPROJECTS_KIND, req.params.subprojectid],
            // });

            // get the subproject info
            // const subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid, spkey);

            const subproject: any = {
                'acls': {
                    'admins': [
                        'service.seistore.evd.k8s.blade.admin@slb.p4d.cloud.slb-ds.com',
                        'service.seistore.evd.k8s.blade.editor@slb.p4d.cloud.slb-ds.com'
                    ],
                    'viewers': [
                        'service.seistore.evd.k8s.blade.viewer@slb.p4d.cloud.slb-ds.com'
                    ]
                },
                'admin': 'alichnewsky@slb.com',
                'storage_class': 'REGIONAL',
                'name': 'blade',
                'ltag': 'slb-public-usa-seistore-1',
                'gcs_bucket': 'ss-evd-33caqt4hhnejej3d',
                'storage_location': 'US-CENTRAL1',
                'tenant': 'k8s'
            }


            // set gcs URL and LegaTag with the subproject information
            dataset.gcsurl = subproject.gcs_bucket + '/' + uuidv4()
            dataset.ltag = dataset.ltag || subproject.ltag;

            // ensure that a legal tag exist
            if (!dataset.ltag) {
                throw Error.make(Error.Status.NOT_FOUND,
                    'No legal-tag has been found for the subproject resource ' +
                    Config.SDPATHPREFIX + dataset.tenant + '/' + dataset.subproject +
                    ' the storage metdatada cannot be updated without a valida legal-tag');
            }

            // check if has read access, if legal tag is valid, and if the dataset does not already exist
            await Promise.all([
                FeatureFlags.isEnabled(Feature.AUTHORIZATION) ?
                    Auth.isWriteAuthorized(req.headers.authorization,
                        subproject.acls.admins,
                        dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
                FeatureFlags.isEnabled(Feature.LEGALTAG) ?
                    dataset.ltag ? Auth.isLegalTagValid(
                        req.headers.authorization, dataset.ltag,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined : undefined,
            ]);

            // check if dataset already exist
            if ((await DatasetDAO.get(journalClient, dataset))[0]) {
                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
                    dataset.subproject + dataset.path + dataset.name +
                    ' already exists'));
            }

            // const key = Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + dataset.tenant + ':' +
            //     dataset.subproject + ':' + dataset.path + ':' + dataset.name
            // if(await this._cache.get(key)) {
            //     throw (Error.make(Error.Status.ALREADY_EXISTS,
            //     'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
            //     dataset.subproject + dataset.path + dataset.name + ' already exists'));
            // }

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
            const dskey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject,
                path: [Config.DATASETS_KIND],
            });

            // save the dataset entity
            await Promise.all([
                DatasetDAO.register(journalClient, { key: dskey, data: dataset }),
                // await this._cache.set(key, dataset),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization,
                        [seismicmeta], tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);


            // attach the gcpid for fast check
            dataset.ctag = dataset.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

            // release the mutex and keep the lock session
            await Locker.removeWriteLock(writeLockSession, true);
            // await transaction.commit();
            return dataset;

        } catch (err) {

            // release the mutex and unlock the resource
            await Locker.removeWriteLock(writeLockSession);
            // await transaction.rollback();
            throw (err);

        }

    }

    // retrieve the dataset metadata
    private static async get(req: expRequest, tenant: TenantModel) {

        // parse user request
        const userInput = DatasetParser.get(req);
        const datasetIN = userInput[0];

        // retrieve journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const datasetOUT = (await DatasetDAO.get(journalClient, datasetIN))[0];

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, datasetIN.subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, datasetIN.subproject, spkey)

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // Check if retrieve the seismic metadata storage record
        const getSeismicMeta = datasetOUT.seismicmeta_guid !== undefined && userInput[1];

        // Check if user has read access and legal tag is valid
        await Promise.all([
            FeatureFlags.isEnabled(Feature.AUTHORIZATION) ?
                Auth.isReadAuthorized(req.headers.authorization,
                    subproject.acls.viewers.concat(subproject.acls.admins),
                    datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            FeatureFlags.isEnabled(Feature.LEGALTAG) ?
                datasetOUT.ltag ? Auth.isLegalTagValid(
                    req.headers.authorization, datasetOUT.ltag,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined : undefined
        ]);

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
    private static async list(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const dataset = DatasetParser.list(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, dataset.subproject],
        });

        // Retrieve subproject information
        const subproject = await SubProjectDAO.get(journalClient, tenant.name, dataset.subproject, spkey)

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }


        // Retrieve the list of datasets metadata
        const datasets = await DatasetDAO.list(journalClient, dataset);

        // attach the gcpid for fast check
        for (const item of datasets) {
            item.ctag = item.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);
        }

        // Retrieve the list of datasets metadata
        return datasets;

    }

    // delete a dataset
    private static async delete(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const datasetIn = DatasetParser.delete(req);

        // ensure is not write locked
        if(!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            if (Locker.isWriteLock(await Locker.getLockFromModel(datasetIn))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIn.tenant + '/' +
                    datasetIn.subproject + datasetIn.path + datasetIn.name + ' is write locked'));
            }
        }

        // init datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // // retrieve subproject meta info
        // const spkey = journalClient.createKey({
        //     namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
        //     path: [Config.SUBPROJECTS_KIND, datasetIn.subproject],
        // });
        // const subproject = await SubProjectDAO.get(journalClient, tenant.name, datasetIn.subproject, spkey);

        const subproject: any = {
            'acls': {
                'admins': [
                    'service.seistore.evd.k8s.blade.admin@slb.p4d.cloud.slb-ds.com',
                    'service.seistore.evd.k8s.blade.editor@slb.p4d.cloud.slb-ds.com'
                ],
                'viewers': [
                    'service.seistore.evd.k8s.blade.viewer@slb.p4d.cloud.slb-ds.com'
                ]
            },
            'admin': 'alichnewsky@slb.com',
            'storage_class': 'REGIONAL',
            'name': 'blade',
            'ltag': 'slb-public-usa-seistore-1',
            'gcs_bucket': 'ss-evd-33caqt4hhnejej3d',
            'storage_location': 'US-CENTRAL1',
            'tenant': 'k8s'
        }

        // try {

            // check authorization (write)
            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                // Check authorizations
                await Auth.isWriteAuthorized(req.headers.authorization,
                    subproject.acls.admins,
                    tenant.name, subproject.name, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }

            // Retrieve the dataset metadata
            const dataset = (await DatasetDAO.get(journalClient, datasetIn))[0];

            // const key = Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + datasetIn.tenant + ':' +
            //     datasetIn.subproject + ':' + datasetIn.path + ':' + datasetIn.name
            // const dataset = await this._cache.get(key);

            // if the dataset does not exist return ok
            if (!dataset) { return; }

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
                // await this._cache.del(key),
                // delete des storage record
                (dataset.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.deleteRecord(req.headers.authorization,
                        dataset.seismicmeta_guid, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            // Delete all phisical objects (not wait for full objects deletion)
            const bucketName = dataset.gcsurl.split('/')[0];
            const gcsprefix = dataset.gcsurl.split('/')[1];
            const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
            await storage.deleteObjects(bucketName, gcsprefix);

            // remove any remaining locks (this should be removed with SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS)
            // await Locker.unlock(journalClient, dataset)
            await Locker.unlock(undefined, dataset)

        // } catch (err) {
            // throw (err);

        // }
    }

    // patch the dataset metadata
    private static async patch(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const [datasetIN, seismicmeta, newName, wid] = DatasetParser.patch(req);

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);
        // const transaction = journalClient.getTransaction();

        // return immediately if it is a simple close wiht empty body (no patch to apply)
        if (Object.keys(req.body).length === 0 && req.body.constructor === Object && wid) {

            // Retrieve the dataset metadata
            const dataset = (await DatasetDAO.get(journalClient, datasetIN))[0];
            // const datasetKey = Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + datasetIN.tenant + ':' +
                // datasetIN.subproject + ':' + datasetIN.path + ':' + datasetIN.name
            // const dataset = await this._cache.get(datasetKey);

            // check if the dataset does not exist
            if (!dataset) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }

            // // unlock the detaset
            // const unlockRes = await Locker.unlock(journalClient, datasetIN, wid)
            const unlockRes = await Locker.unlock(undefined, datasetIN, wid)
            dataset.sbit = unlockRes.id;
            dataset.sbit_count = unlockRes.cnt;

            return dataset;
        }

        // unlock the detaset for close opeartion (and patch)
        // const lockres = wid ? await Locker.unlock(journalClient, datasetIN, wid) : { id: null, cnt: 0 };
        const lockres = wid ? await Locker.unlock(undefined, datasetIN, wid) : { id: null, cnt: 0 };

        // ensure nobody got the lock between the close and the mutext acquistion
        if(!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            if (Locker.isWriteLock(await Locker.getLockFromModel(datasetIN))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' is write locked'));
            }
        }

        // try {

            // await transaction.run();

            // const spkey = journalClient.createKey({
            //     namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            //     path: [Config.SUBPROJECTS_KIND, datasetIN.subproject]
            // });

            // Retrieve subproject information
            // const subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid, spkey);

            const subproject: any = {
                'acls': {
                    'admins': [
                        'service.seistore.evd.k8s.blade.admin@slb.p4d.cloud.slb-ds.com',
                        'service.seistore.evd.k8s.blade.editor@slb.p4d.cloud.slb-ds.com'
                    ],
                    'viewers': [
                        'service.seistore.evd.k8s.blade.viewer@slb.p4d.cloud.slb-ds.com'
                    ]
                },
                'admin': 'alichnewsky@slb.com',
                'storage_class': 'REGIONAL',
                'name': 'blade',
                'ltag': 'slb-public-usa-seistore-1',
                'gcs_bucket': 'ss-evd-33caqt4hhnejej3d',
                'storage_location': 'US-CENTRAL1',
                'tenant': 'k8s'
            }

            // Retrieve the dataset metadata
            const results = await DatasetDAO.get(journalClient, datasetIN);
            // let key = Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + datasetIN.tenant + ':' +
                // datasetIN.subproject + ':' + datasetIN.path + ':' + datasetIN.name
            // const datasetOUT = await this._cache.get(key);
            const datasetOUT = results[0];
            const datasetOUTKey = results[1];

            // check if the dataset does not exist
            if (!datasetOUT) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }

            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                // Check authorizations
                await Auth.isWriteAuthorized(req.headers.authorization,
                    subproject.acls.admins,
                    datasetIN.tenant, subproject.name, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
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

                const renameResults = await DatasetDAO.get(journalClient, datasetIN);

                if (renameResults[1] !== undefined) {
                    throw (Error.make(Error.Status.ALREADY_EXISTS,
                        'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                        datasetIN.subproject + datasetIN.path + newName + ' already exists'));

                }

                // key = Config.SEISMIC_STORE_NS + ':' + Config.DATASETS_KIND + ':' + datasetIN.tenant + ':' +
                //     datasetIN.subproject + ':' + datasetIN.path + ':' + datasetIN.name

                // const renameResults = await this._cache.get(key);

                // if (renameResults) {
                //     throw (Error.make(Error.Status.ALREADY_EXISTS,
                //         'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                //         datasetIN.subproject + datasetIN.path + newName + ' already exists'));

                // }

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

                    for (const keyx of Object.keys(seismicmeta)) {
                        seismicmetaDE[keyx] = seismicmeta[keyx];
                    }

                    datasetOUT.seismicmeta_guid = seismicmeta.id;

                } else {

                    // mandatory field required if a new seismic metadata record is ingested (kind/data required)
                    Params.checkString(seismicmeta.kind, 'kind');
                    Params.checkObject(seismicmeta.data, 'data');

                    // {data-parititon(delfi)|auhtority(osdu)}.{source}.{entityType}.{semanticSchemaVersion}
                    if((seismicmeta.kind as string).split(':').length !== 4) {
                        throw (Error.make(Error.Status.BAD_REQUEST, 'The seismicmeta kind is in a wrong format'));
                    }

                    // (recortdType == entityType)
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
                                    ' the storage metdatada cannot be updated without a valida legal-tag') :
                                Error.make(Error.Status.NOT_FOUND,
                                    'No legal-tag has been found on the dataset resource ' +
                                    Config.SDPATHPREFIX + datasetIN.tenant + '/' + datasetIN.subproject +
                                    datasetIN.path + datasetIN.name +
                                    ' the storage metdatada cannot be updated without a valida legal-tag'));
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

            await Promise.all([
                DatasetDAO.update(journalClient, datasetOUT, datasetOUTKey),
                // await this._cache.set(key, datasetOUT),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE)))
                    ? DESStorage.insertRecord(req.headers.authorization, [seismicmetaDE],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined]);

            // attach lock information
            if (wid) {
                datasetOUT.sbit = lockres.id;
                datasetOUT.sbit_count = lockres.cnt;
            }
            // await transaction.commit();

            // attach the gcpid for fast check
            datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

            return datasetOUT;

        // } catch (err) {
        //     await transaction.rollback();
        //     throw (err);
        // }
    }

    // lock the dataset metadata for opening
    private static async lock(req: expRequest, tenant: TenantModel) {

        // parse user request
        const userInput = DatasetParser.lock(req);
        const datasetIN = userInput.dataset;
        const open4write = userInput.open4write;
        const wid = userInput.wid;

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const datasetOUT = (await DatasetDAO.get(journalClient, datasetIN))[0];

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, datasetIN.subproject],
        });


        const subproject = await SubProjectDAO.get(journalClient, tenant.name, datasetIN.subproject, spkey)

        // check if the dataset does not exist
        if (!datasetOUT) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        await Promise.all([
            FeatureFlags.isEnabled(Feature.AUTHORIZATION) ?
                open4write ?
                    Auth.isWriteAuthorized(req.headers.authorization,
                        subproject.acls.admins,
                        datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) :
                    Auth.isReadAuthorized(req.headers.authorization,
                        subproject.acls.viewers.concat(subproject.acls.admins),
                        datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) :
                undefined,
            FeatureFlags.isEnabled(Feature.LEGALTAG) ?
                datasetOUT.ltag ?
                    Auth.isLegalTagValid(req.headers.authorization, datasetOUT.ltag,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) :
                    undefined :
                undefined
        ]);

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
        const lockres = open4write ?
            await Locker.acquireWriteLock(
                journalClient, datasetIN, req.headers['x-seismic-dms-lockid'] as string, wid) :
            await Locker.acquireReadLock(
                journalClient, datasetIN, req.headers['x-seismic-dms-lockid'] as string, wid);

        // attach lock information
        datasetOUT.sbit = lockres.id;
        datasetOUT.sbit_count = lockres.cnt;

        // attach the gcpid for fast check
        datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

        return datasetOUT;

    }

    // unlock the dataset metadata for opening
    private static async unlock(req: expRequest, tenant: TenantModel) {

        // parse user request
        const datasetIN = DatasetParser.unlock(req);

        // retrieve datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const dataset = (await DatasetDAO.get(journalClient, datasetIN))[0];


        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, datasetIN.subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, datasetIN.subproject, spkey)

        // check if the dataset does not exist
        if (!dataset) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // check if user is write authorized
        await Auth.isWriteAuthorized(req.headers.authorization,
            subproject.acls.admins,
            tenant.name, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // unlock
        await Locker.unlock(journalClient, dataset);

    }

    // check if a list of datasets exist in a subproject
    private static async exists(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const datasets = DatasetParser.exists(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + datasets[0].tenant,
            path: [Config.SUBPROJECTS_KIND, datasets[0].subproject],
        });

        // Retrieve subproject information
        const subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid, spkey);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                datasets[0].tenant, datasets[0].subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }


        // Check if the required datasets exist
        const results: boolean[] = [];
        for (const dataset of datasets) {
            results.push((await DatasetDAO.get(journalClient, dataset))[0] !== undefined);
        }

        return results;
    }

    // retrieve the dataset size for a list of datasets
    private static async sizes(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const datasets = DatasetParser.sizes(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + datasets[0].tenant,
            path: [Config.SUBPROJECTS_KIND, datasets[0].subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, datasets[0].tenant, datasets[0].subproject, spkey);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                datasets[0].tenant, datasets[0].subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }



        // Check if the required datasets exist
        const results: number[] = [];
        for (let dataset of datasets) {
            dataset = (await DatasetDAO.get(journalClient, dataset))[0];
            if (dataset === undefined) {
                results.push(-1);
                continue;
            }
            results.push(!dataset.filemetadata || !dataset.filemetadata.size ? -1 : dataset.filemetadata.size);

        }

        return results;

    }

    // list the path content
    private static async listContent(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset information
        const dataset = DatasetParser.listContent(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant,
            path: [Config.SUBPROJECTS_KIND, dataset.subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, dataset.tenant, dataset.subproject, spkey)

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // list the folder content
        return await DatasetDAO.listContent(journalClient, dataset);

    }

    private static async putTags(req: expRequest, tenant: TenantModel) {

        const datasetIN = DatasetParser.putTags(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const transaction = journalClient.getTransaction();

        // ensure is not write locked
        if(!Config.SKIP_WRITE_LOCK_CHECK_ON_MUTABLE_OPERATIONS) {
            if (Locker.isWriteLock(await Locker.getLockFromModel(datasetIN))) {
                throw (Error.make(Error.Status.LOCKED,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' is write locked'));
            }
        }

        try {

            await transaction.run();

            const results = await DatasetDAO.get(journalClient, datasetIN);
            const datasetOUT = results[0];
            const datasetOUTKey = results[1];

            // Check if the dataset does not exist
            if (!datasetOUT) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }

            if (datasetOUT.gtags) {
                datasetOUT.gtags = datasetOUT.gtags.concat(datasetIN.gtags);
                datasetOUT.gtags = datasetOUT.gtags.filter((item, index) => datasetOUT.gtags.indexOf(item) === index);
            } else {
                datasetOUT.gtags = datasetIN.gtags;
            }

            // Retrieve subproject information
            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, datasetIN.subproject],
            });

            const subproject = await SubProjectDAO.get(journalClient, tenant.name, datasetIN.subproject, spkey);

            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                await Auth.isWriteAuthorized(req.headers.authorization,
                    subproject.acls.admins,
                    datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }

            await DatasetDAO.update(transaction, datasetOUT, datasetOUTKey);
            await transaction.commit();

        } catch (err) {
            await transaction.rollback();
            throw (err);
        }

    }

    // check the permissions of a user on a dataset
    private static async checkPermissions(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const dataset = DatasetParser.checkPermissions(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // check if the dataset does not exist
        if (!(await DatasetDAO.get(journalClient, dataset))[0]) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
                dataset.subproject + dataset.path + dataset.name + ' does not exist'));
        }

        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, dataset.subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, dataset.subproject, spkey)

        const res = { read: false, write: false, delete: false };

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check if has write and read access
            res.write = await Auth.isWriteAuthorized(req.headers.authorization,
                subproject.acls.admins,
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY], false);
            res.read = await Auth.isReadAuthorized(
                req.headers.authorization,
                subproject.acls.viewers.concat(subproject.acls.admins),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY], false);
        } else {
            res.write = true;
            res.read = true;
        }
        res.delete = res.write;
        return res;

    }

}
