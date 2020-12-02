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
import { SubProjectModel } from '.';
import { Error, Params, Utils } from '../../shared';
import { Config } from '../../cloud';
import { SubprojectGroups } from '../subproject';

// reference time zone and clss locations
// [TODO] These should not be fixed and the list should be fetch from the cloud
const KSTORAGE_CLASS = ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'COLDLINE'];
const KSTORAGE_LOCATION_MR = ['ASIA', 'EU', 'US'];
const KSTORAGE_LOCATION_RG = ['NORTHAMERICA-NORTHEAST1', 'US-CENTRAL1', 'US-EAST1',
    'US-EAST4', 'US-WEST1', 'SOUTHAMERICA-EAST1', 'EUROPE-WEST1',
    'EUROPE-WEST2', 'EUROPE-WEST3', 'EUROPE-WEST4', 'ASIA-EAST1',
    'ASIA-NORTHEAST1', 'ASIA-SOUTH1', 'ASIA-SOUTHEAST1',
    'AUSTRALIA-SOUTHEAST1'];

export class SubProjectParser {

    public static create(req: expRequest): SubProjectModel {

        // check if body exist and is not empty
        Params.checkBody(req.body);

        const subproject = {} as SubProjectModel;
        subproject.name = req.params.subprojectid;
        subproject.tenant = req.params.tenantid;
        subproject.admin = req.body.admin;
        subproject.storage_class = req.body.storage_class;
        subproject.storage_location = req.body.storage_location;
        subproject.ltag = req.headers.ltag as string;

        // check user input params
        Params.checkEmail(subproject.admin, 'admin');
        Params.checkString(subproject.storage_class, 'storage_class');
        Params.checkString(subproject.storage_location, 'storage_location');
        Params.checkString(subproject.ltag, 'ltag');

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        subproject.admin = Utils.checkSauthV1EmailDomainName(subproject.admin);

        subproject.storage_class = req.body.storage_class.toUpperCase();
        subproject.storage_location = req.body.storage_location.toUpperCase();

        // check that a subproject name is short enough to fit into the quota
        // groups are constructed as
        // seistore.service.<env>.<tenant_name>.<subproject_name>.role
        const allowedSubprojLen = Config.DES_GROUP_CHAR_LIMIT - Math.max(
            SubprojectGroups.adminGroupName(subproject.tenant,subproject.name).length,
            SubprojectGroups.editorGroupName(subproject.tenant,subproject.name).length,
            SubprojectGroups.viewerGroupName(subproject.tenant,subproject.name).length) + subproject.name.length;

        if(allowedSubprojLen < subproject.name.length) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    subproject.name + ' name is too long, for tenant ' + subproject.tenant +
                    ', a subproject name must not more than ' + allowedSubprojLen + ' characters'));
        }

        // check if the subproject name is in the correct form
        if (!subproject.name.match(/^[a-z][a-z\d\-]*[a-z\d]$/g)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The subproject name (' + subproject.name + ') ' +
                'does not match the required pattern [a-z][a-z\\d\\-]*[a-z\\d]'));
        }

        //  check if the storage class
        if (KSTORAGE_CLASS.indexOf(subproject.storage_class) === -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_class body field ' + subproject.storage_class +
                ' is not valid. It must be one of ' + KSTORAGE_CLASS.join(', ')));
        }

        // check the storage location
        if (KSTORAGE_LOCATION_MR.indexOf(subproject.storage_location) === -1 &&
            KSTORAGE_LOCATION_RG.indexOf(subproject.storage_location) === -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is not valid. It must be one of ' +
                (KSTORAGE_LOCATION_MR.concat(KSTORAGE_LOCATION_RG)).join(', ')));
        }

        // check the storage location
        if (subproject.storage_class === 'MULTI_REGIONAL' &&
            KSTORAGE_LOCATION_RG.indexOf(subproject.storage_location) > -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is a regional storage location and it\'s not valid for a MULTI_REGIONAL' +
                ' storage class. It must be one of ' + KSTORAGE_LOCATION_MR.join(', ')));
        }

        // check the storage location
        if (subproject.storage_class === 'REGIONAL' &&
            KSTORAGE_LOCATION_MR.indexOf(subproject.storage_location) > -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is a multi regional storage location and it\'s not valid for a REGIONAL' +
                ' storage class. It must be one of ' + KSTORAGE_LOCATION_RG.join(', ')));
        }

        return subproject;
    }

    public static patch(req: expRequest): {ltag: string, recursive: boolean} {

        Params.checkString(req.query.recursive, 'recursive', false);

        return {
            ltag: req.get('ltag'),
            recursive: req.query.recursive ? (req.query.recursive === 'true') : false }
    }

}
