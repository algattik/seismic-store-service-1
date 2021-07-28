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
import { Error, Params, SDPath, Utils } from '../../shared';
import { ImpersonationTokenRequestBodyModel, ImpersonationTokenResourceModel } from './model';

export class ImpersonationTokenParser {

    public static async generate(req: expRequest): Promise<ImpersonationTokenRequestBodyModel> {

        // request body payload
        Params.checkBody(req.body);
        const impersonationTokenRequestBody:ImpersonationTokenRequestBodyModel = {
            userToken: req.headers['user-token'] as string,
            resources: req.body.resources,
            metadata: req.body.metadata
        }

        // user token
        if(!impersonationTokenRequestBody.userToken) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The request user-token header has not been specified.'));
        }

        // Ensure is not an expire token (validity will be checked on the handler)
        impersonationTokenRequestBody.userToken = impersonationTokenRequestBody.userToken.replace('Bearer', '').replace(/\s/g, '');
        const exp = Utils.getExpTimeFromPayload(impersonationTokenRequestBody.userToken);
        if (exp < Math.floor(Date.now() / 1000)) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The specified \'user-token\' expired.'));
        }

        // metadata
        Params.checkObject(impersonationTokenRequestBody.metadata, 'metadata', false);

        // resources
        Params.checkArray(impersonationTokenRequestBody.resources, 'resources');
        if (impersonationTokenRequestBody.resources.length === 0) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'resources\' body field is empty.'));
        }
        const resourcesMap = new Map<string, ImpersonationTokenResourceModel>();
        let tenantReference: string;
        for (const item of impersonationTokenRequestBody.resources) {

            Params.checkObject(item, 'resource');
            Params.checkString(item.resource, 'resource path');
            Params.checkBoolean(item.readonly, 'resource path', false);

            const sdpath = SDPath.getFromString(item.resource);
            if (!sdpath || !sdpath.subproject) {
                throw (Error.make(Error.Status.BAD_REQUEST, 'The resource ' + item.resource +
                    ' is not valid seismic store subproject resource path'));
            }

            tenantReference = tenantReference || sdpath.tenant;
            if (tenantReference !== sdpath.tenant) {
                throw (Error.make(Error.Status.BAD_REQUEST, 'The resources cannot have different tenants'));
            }

            const subprojectPath = sdpath.tenant + '/' + sdpath.subproject;
            let readonly = (item.readonly === undefined) ? true : item.readonly;
            const cached = resourcesMap.get(subprojectPath);
            readonly = (cached === undefined) ? readonly : (cached.readonly && readonly);
            resourcesMap.set(subprojectPath, { resource: subprojectPath, readonly });
        }
        impersonationTokenRequestBody.resources = Array.from(resourcesMap.values());

        return impersonationTokenRequestBody;

    }

    public static refresh(req: expRequest): {token: string, tenantName: string} {

        const token = req.headers['impersonation-token'] as string;
        if(!token) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The request impersonation-token header has not been specified.'));
        }
        const tenantName = req.query['tenant-name'];
        if(!tenantName) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The tenant-name query paramter has not been specified.'));
        }

        return {token, tenantName}
    }

    public static getSignatures(req: expRequest): string {

        const tenantName = req.query['tenant-name'];
        if(!tenantName) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The tenant-name query paramter has not been specified.'));
        }
        return tenantName;
    }

    public static deleteSignatures(req: expRequest): {token: string, tenantName: string, signatures: string[]} {

        const tenantName = req.query['tenant-name'];
        if(!tenantName) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The tenant-name query paramter has not been specified.'));
        }

        const token = req.headers['impersonation-token'] as string;
        const signatures = req.query['signatures'];

        if(!signatures && !token) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The request must present the impersonation-token header or a non-empty of signatures.'));
        }

        if(signatures) {
            if(signatures.length === 0 && !token) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The request must present the impersonation-token header or a non-empty list of signatures.'));
            }
        }

        return {token, tenantName, signatures}
    }

}
