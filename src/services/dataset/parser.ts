// ============================================================================
// Copyright 2017-2019, Schlumberger
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

import { Request as expRequest } from 'express';
import { DatasetModel } from '.';
import { Error, Params, Utils } from '../../shared';

export class DatasetParser {

    public static checkCTag(req: expRequest): { tenantID: string, dataPartitionID: string, dataset: DatasetModel; } {

        const dataset = this.createDatasetModelFromRequest(req);

        Params.checkString(req.query.ctag, 'ctag');

        if (req.query.ctag.length < 19) { // ctag (16) + project(3 at least)
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'ctag\' query parameter is in a wrong format.'));
        }

        dataset.ctag = req.query.ctag.substr(0, 16);
        const tmp = req.query.ctag.substr(16) as string;
        const tenantID = tmp.split(';')[0];
        const dataPartitionID = tmp.split(';')[1];

        return { tenantID, dataPartitionID, dataset };

    }

    public static register(req: expRequest): [DatasetModel, any] {

        // Init the dataset model from user input parameters
        const dataset = this.createDatasetModelFromRequest(req);
        dataset.ltag = (req.headers.ltag) as string;
        dataset.type = req.body ? req.body.type : undefined;
        dataset.created_by = Utils.getEmailFromTokenPayload(req.headers.authorization);
        dataset.created_date = dataset.last_modified_date = new Date().toString();
        dataset.gtags = req.body ? req.body.gtags : undefined;

        // Check the parameters
        Params.checkString(dataset.type, 'type', false);
        Params.checkString(dataset.ltag, 'ltag', false);
        const seismicmeta = req.body ? req.body.seismicmeta : undefined;
        Params.checkObject(seismicmeta, 'seismicmeta', false);

        // Check seismic meta mandatory field  if present
        if (seismicmeta) {
            Params.checkString(seismicmeta.kind, 'kind'); // mandatory string
            Params.checkObject(seismicmeta.data, 'data');
            seismicmeta.recordType = seismicmeta.recordType ? ':' + seismicmeta.recordType + ':' : ':seismic:';
        }

        return [dataset, seismicmeta];

    }

    public static get(req: expRequest): [DatasetModel, boolean] {
        return [this.createDatasetModelFromRequest(req),
        req.query.seismicmeta === 'true'];
    }

    public static list(req: expRequest): DatasetModel {
        const dataset = this.createDatasetModelFromRequest(req);
        dataset.gtags = req.query.gtag;
        return dataset;
    }

    public static delete(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static patch(req: expRequest): [DatasetModel, any, string, string] {

        const closeid = req.query.close;
        Params.checkString(closeid, 'close', false);
        Params.checkBody(req.body, closeid === undefined); // body is required only if is not a closing request

        const dataset = this.createDatasetModelFromRequest(req);

        // Patch meta data
        dataset.metadata = req.body.metadata;
        dataset.filemetadata = req.body.filemetadata;
        Params.checkObject(dataset.metadata, 'metadata', false);
        Params.checkObject(dataset.filemetadata, 'filemetadata', false);

        // Patch tags
        dataset.gtags = req.body.gtags;
        dataset.ltag = req.body.ltag;
        Params.checkArray(dataset.gtags, 'gtags', false);
        Params.checkString(dataset.ltag, 'ltag', false);

        // readonly
        Params.checkBoolean(req.body.readonly, 'readonly', false);
        dataset.readonly = req.body.readonly;

        // remove the parameter... this field should always update when patch
        dataset.last_modified_date = new Date().toString();

        // Patch newName
        const newName = req.body.dataset_new_name;
        Params.checkString(newName, 'dataset_new_name', false);

        // Patch seismicmeta
        const seismicmeta = req.body.seismicmeta;
        Params.checkObject(seismicmeta, 'seismicmeta', false);

        return [dataset, seismicmeta, newName, closeid];
    }

    public static lock(req: expRequest): { dataset: DatasetModel, open4write: boolean, wid: string; } {
        let openmode = req.query.openmode;
        Params.checkString(req.query.openmode, 'openmode');

        openmode = (req.query.openmode as string).toLowerCase();
        if (openmode !== 'read' && openmode !== 'write') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'openmode\' query parameter must be \'read\' or \'write\'.'));
        }
        const open4write = openmode === 'write';

        const wid = req.query.wid;
        Params.checkString(req.query.wid, wid, false);

        const dataset = this.createDatasetModelFromRequest(req);

        return { dataset, open4write, wid };
    }

    public static unlock(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static exists(req: expRequest): DatasetModel[] {

        Params.checkBody(req.body);

        const datasetBody = req.body.datasets;
        Params.checkArray(datasetBody, 'datasets');

        if (datasetBody.length === 0) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'datasets\' body field is empty.'));
        }
        const datasets: DatasetModel[] = [];
        for (const item of datasetBody) {

            Params.checkString(item, 'datasets', false);
            if (item.length === 0) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The \'datasets\' body field cannot contain empty elements.'));
            }

            const dataset = this.createDatasetModelFromRequest(req);

            dataset.path = '/' + (item.lastIndexOf('/') === 0 ?
                '/' : item.substring(0, item.lastIndexOf('/') + 1)) + '/';
            while (dataset.path.indexOf('//') !== -1) { dataset.path = dataset.path.replace('//', '/'); }
            dataset.name = item.substring(item.lastIndexOf('/') + 1);
            datasets.push(dataset);

        }

        return datasets;

    }

    public static sizes(req: expRequest): DatasetModel[] {
        return this.exists(req);
    }

    public static listContent(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static checkPermissions(req: expRequest): DatasetModel {
        return this.createDatasetModelFromRequest(req);
    }

    public static putTags(req: expRequest): DatasetModel {
        const dataset = this.createDatasetModelFromRequest(req);
        dataset.gtags = req.query.gtag;
        return dataset;
    }

    private static createDatasetModelFromRequest(req: expRequest) {
        const dataset: DatasetModel = {} as DatasetModel;
        this.getSDPathFromURLParams(dataset, req);
        return dataset;
    }

    private static getSDPathFromURLParams(dataset: DatasetModel, req: expRequest) {
        dataset.name = req.params.datasetid;
        dataset.tenant = req.params.tenantid;
        dataset.subproject = req.params.subprojectid;

        const path = req.query.path ? '/' + decodeURIComponent(req.query.path) + '/' : '/';
        Params.checkDatasetPath(path, 'path', true);
        dataset.path = path;

        while (dataset.path.indexOf('//') !== -1) { dataset.path = dataset.path.replace('//', '/'); }
    }

}
