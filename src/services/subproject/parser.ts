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
import { SubProjectModel } from '.';
import { Config } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Params, Utils } from '../../shared';
import { ISubprojectAcl } from './model';

export class SubProjectParser {

    public static async create(req: expRequest): Promise<SubProjectModel> {

        const subproject = {} as SubProjectModel;
        subproject.name = req.params.subprojectid;
        subproject.tenant = req.params.tenantid;
        subproject.ltag = req.headers.ltag as string;
        // optional parameters
        subproject.admin = (req.body && req.body.admin) ?
            req.body.admin : (await SeistoreFactory.build(
                Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, true));

        subproject.acls = (req.body && req.body.acls) ? req.body.acls : { 'admins': [], 'viewers': [] }
        // check user input params
        Params.checkEmail(subproject.admin, 'admin', false);
        Params.checkString(subproject.ltag, 'ltag', false);

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        subproject.admin = subproject.admin ? Utils.checkSauthV1EmailDomainName(subproject.admin) : subproject.admin;

        // check if the subproject name is in the correct form
        if (!subproject.name.match(/^[a-z][a-z\d\-]*[a-z\d]$/g)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The subproject name (' + subproject.name + ') ' +
                'does not match the required pattern [a-z][a-z\\d\\-]*[a-z\\d]'));
        }

        // check extra requirements
        SeistoreFactory.build(Config.CLOUDPROVIDER).checkExtraSubprojectCreateParams(req.body, subproject);

        return subproject;
    }

    public static patch(req: expRequest): { ltag: string, acls: ISubprojectAcl, recursive: boolean } {

        Params.checkString(req.query.recursive, 'recursive', false);

        return {
            ltag: req.get('ltag'),
            acls: (req.body && req.body.acls) ? req.body.acls : undefined,
            recursive: req.query.recursive ? (req.query.recursive === 'true') : false
        }
    }

}
