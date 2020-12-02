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
import { JournalFactoryTenantClient, StorageFactory } from '../../cloud';
import { Config } from '../../cloud';
import { DESStorage, DESUtils } from '../../dataecosystem';
import { Error, Response, TraceLog, Utils, FeatureFlags, Feature, Params } from '../../shared';
import { SubProjectDAO, SubprojectGroups } from '../subproject';
import { TenantDAO, TenantModel } from '../tenant';
import { DatasetDAO } from './dao';
import { Locker } from './locker';
import { DatasetOP } from './optype';
import { DatasetParser } from './parser';

export class DatasetHandler {

    // handler for the [ /dataset ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: DatasetOP) {
        try {

            if (op === DatasetOP.CheckCTag) {
                Response.writeOK(res, await this.checkCTag(req));
            } else {

                if (op === DatasetOP.Register) { res.locals.trace.start('tenant-get'); }
                const tenant = await TenantDAO.get(req.params.tenantid);
                if (op === DatasetOP.Register) { res.locals.trace.stop(); }

                if (op === DatasetOP.Register) {
                    Response.writeOK(res, await this.register(req, tenant, res.locals.trace));
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
            gcpid:  userInput.tenantID, esd: userInput.dataPartitionID, default_acls: 'any', name: 'any' });

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
    private static async register(req: expRequest, tenant: TenantModel, trace: TraceLog) {

        // parse the user input and create the dataset metadata model
        const userInput = DatasetParser.register(req);
        const dataset = userInput[0];
        const seismicmeta = userInput[1];
        const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        let datasetPathMutex: any;

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const transaction = journalClient.getTransaction();

        try {

            await transaction.run();

            // attempt to acquire a mutex on the dataset name and set the sbit for the dataset in redis
            datasetPathMutex = await Locker.createWriteLock(dataset);

            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, req.params.subprojectid],
            });

            // get the subproject info
            trace.start('subproject-get');
            const subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid, spkey);
            trace.stop();

            // set gcs URL and LegaTag with the subproject information
            dataset.gcsurl = subproject.gcs_bucket + '/' + Utils.makeID(16);
            dataset.ltag = dataset.ltag || subproject.ltag;

            // ensure that a legal tag exist
            if (!dataset.ltag) {
                Error.make(Error.Status.NOT_FOUND,
                    'No legal-tag has been found for the subproject resource ' +
                    Config.SDPATHPREFIX + dataset.tenant + '/' + dataset.subproject +
                    ' the storage metdatada cannot be updated without a valida legal-tag');
            }

            // check if has read access, if legal tag is valid, and if the dataset does not already exist
            trace.start('parallel-block01');
            await Promise.all([
                FeatureFlags.isEnabled(Feature.AUTHORIZATION) ?
                    Auth.isWriteAuthorized(req.headers.authorization,
                        SubprojectGroups.getWriteGroups(tenant.name, subproject.name),
                        dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
                FeatureFlags.isEnabled(Feature.LEGALTAG) ?
                    dataset.ltag ? Auth.isLegalTagValid(
                        req.headers.authorization, dataset.ltag,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined : undefined,
            ]);
            trace.stop();

            // check if dataset already exist
            if ((await DatasetDAO.get(journalClient, dataset))[0]) {
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

            // build the CDO object
            const bucket = dataset.gcsurl.split('/')[0];
            const prefixid = dataset.gcsurl.split('/')[1];
            const CDOName = prefixid + '/' + Config.FILE_CDO;
            const CDOMex = JSON.stringify({
                gcs_prefix: prefixid,
                name: Config.SDPATHPREFIX + dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name,
            });

            // prepare the keys
            const dskey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject,
                path: [Config.DATASETS_KIND],
            });

            const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
            // save the dataset entity and save the CDO object
            trace.start('parallel-block02');
            await Promise.all([
                DatasetDAO.register(transaction, { key: dskey, data: dataset }),
                storage.saveObject(bucket, CDOName, CDOMex),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization,
                        [seismicmeta], tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            await transaction.commit();

            trace.stop();

            // attach the gcpid for fast check
            dataset.ctag = dataset.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

            return dataset;
        } catch (err) {

            await transaction.rollback();

            if (datasetPathMutex) {
                await Locker.del(datasetPath);
            }

            throw (err);
        } finally {

            if (datasetPathMutex) {
                await Locker.releaseMutex(datasetPathMutex, datasetPath);
            }

        }

    }

    // retrieve the dataset metadata
    private static async get(req: expRequest, tenant: TenantModel) {

        // parse user request
        const userInput = DatasetParser.get(req);
        const datasetIN = userInput[0];

        // retrieve journalClient client and begin transaction
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const datasetOUT = (await DatasetDAO.get(journalClient, datasetIN))[0];

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
                SubprojectGroups.getReadGroups(datasetIN.tenant, datasetIN.subproject),
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

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(dataset.tenant, dataset.subproject),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

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

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isWriteAuthorized(req.headers.authorization,
                SubprojectGroups.getWriteGroups(tenant.name, datasetIn.subproject),
                tenant.name, datasetIn.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init datastore client
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const transaction = journalClient.getTransaction();

        try {
            await transaction.run();
            // Retrieve the dataset metadata
            const dataset = (await DatasetDAO.get(journalClient, datasetIn))[0];

            // check if the dataset does not exist
            if (!dataset) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIn.tenant + '/' +
                    datasetIn.subproject + datasetIn.path + datasetIn.name + ' does not exist'));
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
                DatasetDAO.delete(transaction, dataset),
                // delete des storage record
                (dataset.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.deleteRecord(req.headers.authorization,
                        dataset.seismicmeta_guid, tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined,
            ]);

            // Delete CDO Object and all phisical objects (not wait for full objects deletion)
            const bucketName = dataset.gcsurl.split('/')[0];
            const gcsprefix = dataset.gcsurl.split('/')[1];
            const CDOName = gcsprefix + '/' + Config.FILE_CDO;

            const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);

            try {
                // Delete the CDO object
                await storage.deleteObject(bucketName, CDOName);

            } catch (err) {

                await transaction.commit();

                // unlock the dataset
                await Locker.unlock(journalClient, dataset, undefined, true);

                return;

            }

            await storage.deleteObjects(bucketName, gcsprefix);

            await transaction.commit();

            // unlock the dataset
            await Locker.unlock(journalClient, dataset, undefined, true);

        } catch (err) {
            await transaction.rollback();

            throw (err);
        }
    }

    // patch the dataset metadata
    private static async patch(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const [datasetIN, seismicmeta, newName, wid] = DatasetParser.patch(req);
        // retrieve datastore client and begin transaction
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const transaction = journalClient.getTransaction();

        let seismicmetaDE: any;
        let patchSeismicMeta: any;

        // unlock the detaset for close opeartion
        const lockres = wid ? await Locker.unlock(journalClient, datasetIN, wid) : { id: null, cnt: 0 };

        try {

            await transaction.run();

            // Retrieve the dataset metadata
            const results = await DatasetDAO.get(journalClient, datasetIN);
            const datasetOUT = results[0];
            const datasetOUTKey = results[1];

            // check if the dataset does not exist
            if (!datasetOUT) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                    datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
            }

            // return immediately if it is a simple close
            if (Object.keys(req.body).length === 0 && req.body.constructor === Object) {
                return datasetOUT;
            }

            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                // Check authorizations
                await Auth.isWriteAuthorized(req.headers.authorization,
                    SubprojectGroups.getWriteGroups(tenant.name, datasetIN.subproject),
                    datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
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

                datasetOUT.name = newName;
            }

            // Populate the storage record with other mandatory field if not supplied.
            if (seismicmeta) {

                // Check if seismic metadata has been already ingested
                patchSeismicMeta = datasetOUT.seismicmeta_guid !== undefined;

                // return the seismicmetadata (if exists)
                if (patchSeismicMeta) {

                    // seismicmeta is already there, need to patch
                    seismicmetaDE = await DESStorage.getRecord(req.headers.authorization, datasetOUT.seismicmeta_guid,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]);

                    for (const key of Object.keys(seismicmeta)) {
                        seismicmetaDE[key] = seismicmeta[key];
                    }

                    datasetOUT.seismicmeta_guid = seismicmeta.id;

                } else {

                    // mandatory field required if a new seismic metadata record is ingested (kind/data required)
                    Params.checkString(seismicmeta.kind, 'kind');
                    Params.checkObject(seismicmeta.data, 'data');
                    seismicmeta.recordType = seismicmeta.recordType ? ':' + seismicmeta.recordType + ':' : ':seismic:';

                    // if id is given, take it. otherwise generate
                    if (!seismicmeta.id) {
                        datasetOUT.seismicmeta_guid = DESUtils.getDataPartitionID(tenant.esd) + seismicmeta.recordType
                            + Utils.makeID(16);
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

                            const subproject = await SubProjectDAO.get(journalClient,
                                tenant.name, req.params.subprojectid, journalClient.createKey({
                                    namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                                    path: [Config.SUBPROJECTS_KIND, req.params.subprojectid],
                                }));

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
                DatasetDAO.update(transaction, datasetOUT, datasetOUTKey),
                (seismicmeta && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE)))
                    ? DESStorage.insertRecord(req.headers.authorization, [seismicmetaDE],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]) : undefined]);

            await transaction.commit();

            // attach the gcpid for fast check
            datasetOUT.ctag = datasetOUT.ctag + tenant.gcpid + ';' + DESUtils.getDataPartitionID(tenant.esd);

            // attach lock information
            if (wid) {
                datasetOUT.sbit = lockres.id;
                datasetOUT.sbit_count = lockres.cnt;
            }

            return datasetOUT;
        } catch (err) {
            await transaction.rollback();
            throw (err);
        }
    }

    // lock the dataset metadata for opening
    private static async lock(req: expRequest, tenant: TenantModel) {

        // parse user request
        const userInput = DatasetParser.lock(req);
        const datasetIN = userInput.dataset;
        const open4write = userInput.open4write;
        const wid = userInput.wid;

       // retrieve datastore client and begin transaction
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const datasetOUT = (await DatasetDAO.get(journalClient, datasetIN))[0];

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
                        SubprojectGroups.getWriteGroups(tenant.name, datasetIN.subproject),
                        datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]) :
                    Auth.isReadAuthorized(req.headers.authorization,
                        SubprojectGroups.getReadGroups(tenant.name, datasetIN.subproject),
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
            await Locker.acquireWriteLock(journalClient, datasetIN, wid) :
            await Locker.acquireReadLock(journalClient, datasetIN, wid);

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

        // retrieve datastore client and begin transaction
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the dataset metadata
        const dataset = (await DatasetDAO.get(journalClient, datasetIN))[0];

        // check if the dataset does not exist
        if (!dataset) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + datasetIN.tenant + '/' +
                datasetIN.subproject + datasetIN.path + datasetIN.name + ' does not exist'));
        }

        // check if user is write authorized
        await Auth.isWriteAuthorized(req.headers.authorization,
            SubprojectGroups.getWriteGroups(tenant.name, dataset.subproject),
            tenant.name, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // unlock
        await Locker.unlock(journalClient, dataset);

    }

    // check if a list of datasets exist in a subproject
    private static async exists(req: expRequest, tenant: TenantModel) {

        // Retrieve the dataset path information
        const datasets = DatasetParser.exists(req);

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(datasets[0].tenant, datasets[0].subproject),
                datasets[0].tenant, datasets[0].subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

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

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(datasets[0].tenant, datasets[0].subproject),
                datasets[0].tenant, datasets[0].subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

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

       if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check authorizations
            await Auth.isReadAuthorized(req.headers.authorization,
                SubprojectGroups.getReadGroups(dataset.tenant, dataset.subproject),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // list the folder content
        return await DatasetDAO.listContent(journalClient, dataset);

    }

    private static async putTags(req: expRequest, tenant: TenantModel) {

        const datasetIN = DatasetParser.putTags(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const transaction = journalClient.getTransaction();

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

            if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
                await Auth.isWriteAuthorized(req.headers.authorization,
                    SubprojectGroups.getWriteGroups(datasetIN.tenant, datasetIN.subproject),
                    datasetIN.tenant, datasetIN.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }

            await DatasetDAO.update(transaction, datasetOUT, datasetOUTKey);

            await transaction.commit();

        } catch (err) {
            // cancel the transaction and rethrow the error
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

        const res = { read: false, write: false, delete: false };

        if (FeatureFlags.isEnabled(Feature.AUTHORIZATION)) {
            // Check if has write and read access
            res.write = await Auth.isWriteAuthorized(req.headers.authorization,
                SubprojectGroups.getWriteGroups(dataset.tenant, dataset.subproject),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY], false);
            res.read = await Auth.isReadAuthorized(
                req.headers.authorization,
                SubprojectGroups.getReadGroups(dataset.tenant, dataset.subproject),
                dataset.tenant, dataset.subproject, tenant.esd, req[Config.DE_FORWARD_APPKEY], false);
        } else {
            res.write = true;
            res.read = true;
        }
        res.delete = res.write;
        return res;

    }

}
