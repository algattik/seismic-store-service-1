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

import { Request as expRequest } from 'express';
import { Config } from '../../cloud';
import { Error, Params, SDPath, SDPathModel } from '../../shared';
import { DatasetModel, PaginationModel } from '../dataset';

export class UtilityParser {

    public static cp(req: expRequest): { sdPathFrom: SDPathModel, sdPathTo: SDPathModel, lock: boolean } {

        Params.checkString(req.query.sdpath_from, 'sdpath_from');
        Params.checkString(req.query.sdpath_to, 'sdpath_to');

        const sdPathFrom = SDPath.getFromString(req.query.sdpath_from as string);
        if (!sdPathFrom) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_from\' query parameter is not a valid seismic store path.'));
        }
        if (!sdPathFrom.dataset) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_from\' query parameter is not a valid seismic store dataset path.'));
        }

        const sdPathTo = SDPath.getFromString(req.query.sdpath_to as string);
        if (!sdPathTo) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_to\' query parameter is not a valid seismic store path.'));
        }
        if (!sdPathTo.dataset) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath_to\' query parameter is not a valid seismic store dataset path.'));
        }

        if (sdPathFrom.tenant !== sdPathTo.tenant) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The datasets must be in the same tenant project.'));
        }

        const lock = req.query.lock ? (req.query.lock as string).toLowerCase() === 'true' : undefined;
        return { sdPathFrom, sdPathTo, lock };

    }

    public static ls(req: expRequest): { sdPath: SDPathModel, wmode: string, pagination: PaginationModel } {

        Params.checkString(req.query.sdpath, 'sdpath');
        Params.checkString(req.query.wmode, 'wmode', false);
        Params.checkString(req.query.limit, 'limit', false);
        Params.checkString(req.query.cursor, 'cursor', false);

        const sdPath = SDPath.getFromString(req.query.sdpath as string, false); // partial path
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store path.'));
        }

        const wmode = (req.query.wmode as string || Config.LS_MODE.ALL).toLowerCase();
        if (wmode !== Config.LS_MODE.ALL && wmode !== Config.LS_MODE.DATASETS && wmode !== Config.LS_MODE.DIRS) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'wmode\' query parameter must be \'dirs\' ' +
                'or \'datasets\'. The \'' + wmode + '\' value is not valid'));
        }

        const limit = parseInt(req.query.limit as string, 10);
        if (limit < 0) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'limit\' query parameter can not be less than zero.'));
        }

        const cursor = req.query.cursor as string;
        if (cursor === '') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'cursor\' query parameter can not be empty if supplied'));
        }

        let pagination = null;
        if (limit || cursor) {
            pagination = { limit, cursor };
        }

        return { sdPath, wmode, pagination };
    }

    public static connectionString(req: expRequest): DatasetModel {

        Params.checkString(req.query.sdpath, 'sdpath');

        const sdPath = SDPath.getFromString(req.query.sdpath as string);

        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store resource path.'));
        }
        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter must be a subproject or a dataset resource path.'));
        }

        const dataset: DatasetModel = {} as DatasetModel;
        dataset.name = sdPath.dataset;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path;

        return dataset;

    }

    public static gcsToken(req: expRequest): { sdPath: SDPathModel, readOnly: boolean; dataset: DatasetModel } {

        Params.checkString(req.query.sdpath, 'sdpath');

        // extract the subproject path and ensure that is at least a subproject path
        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store path.'));
        }

        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store subproject path.'));
        }

        const dataset: DatasetModel = {} as DatasetModel;
        if (sdPath.dataset) {
            this.constructDatasetModel(dataset, sdPath);
        }

        Params.checkString(req.query.readonly, 'readonly', false);
        let readOnlyStr = req.query.readonly as string;
        if (readOnlyStr) {
            readOnlyStr = readOnlyStr.toLowerCase();
            if (readOnlyStr !== 'false' && readOnlyStr !== 'true') {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The \'readonly\' query parameter is not a valid boolean value'));
            }
        }
        const readOnly = readOnlyStr ? (readOnlyStr === 'true') : true;

        return { sdPath, readOnly, dataset };
    }


    private static constructDatasetModel(dataset: DatasetModel, sdPath: SDPathModel) {
        dataset.name = sdPath.dataset;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path;
    }

}
