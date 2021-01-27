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

import { Request as expRequest, Response as expResponse } from 'express';
import { ImpTokenModel } from '.';
import { Auth } from '../../auth';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { SubProjectDAO } from '../subproject';
import { TenantDAO } from '../tenant';
import { ImpTokenDAO } from './dao';
import { ImpTokenOP } from './optype';
import { ImpTokenParser } from './parser';

export class ImpTokenHandler {

    // handler for the [ /imptoken ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: ImpTokenOP) {

        try {

            // This check will be removed once the azure implementation for imptoken will be provided.
            if (Config.CLOUDPROVIDER === 'azure') {
                throw (Error.make(Error.Status.NOT_IMPLEMENTED,
                    'The impersonation token endpoints are not currently supported in azure.'));
            }

            if (Config.CLOUDPROVIDER === 'aws') {
                throw (Error.make(Error.Status.NOT_IMPLEMENTED,
                    'The impersonation token endpoints are not currently supported in aws.'));
            }

            // subproject endpoints are not available with impersonation token
            if (op !== ImpTokenOP.Refresh) {
                if (Auth.isImpersonationToken(req.headers.authorization)) {
                    throw (Error.make(Error.Status.PERMISSION_DENIED,
                        'Impersonation token endpoints not available' +
                        ' with an impersonation token as Auth credentials.'));
                }
            }

            if (op === ImpTokenOP.Generate) {
                Response.writeOK(res, await this.create(req));
            } else if (op === ImpTokenOP.Refresh) {
                Response.writeOK(res, await this.refresh(req));
            } else if (op === ImpTokenOP.Patch) {
                Response.writeOK(res, await this.patch(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) { Response.writeError(res, error); }

    }

    // create an impersonation token
    private static async create(req: expRequest): Promise<ImpTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpTokenModel;

        const tokenBody = await ImpTokenParser.create(req);
        const tenantName = tokenBody.resources[0].resource.split('/')[0];
        const tenant = await TenantDAO.get(tenantName);

        // check if it is a trusted application
        const appEmail = await SeistoreFactory.build(
            Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, false);

        await Auth.isAppAuthorized(tenant, appEmail);

        // check authorization in each subproject
        const checkAuthorizations = [];
        for (const item of tokenBody.resources) {
            const resourcePath = item.resource.split('/');

            const subprojectName = resourcePath[1]


            // init journalClient client
            const journalClient = JournalFactoryTenantClient.get(tenant);

            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, subprojectName],
            });

            // retrieve the destination subproject info
            const subproject = await SubProjectDAO.get(journalClient, tenant.name, subprojectName, spkey);

            if (item.readonly) {
                checkAuthorizations.push(
                    Auth.isReadAuthorized(tokenBody.userToken,
                        subproject.acls.viewers.concat(subproject.acls.admins),
                        resourcePath[0], resourcePath[1], tenant.esd, req[Config.DE_FORWARD_APPKEY], false));
            } else {
                checkAuthorizations.push(
                    Auth.isWriteAuthorized(tokenBody.userToken,
                        subproject.acls.admins,
                        resourcePath[0], resourcePath[1], tenant.esd, req[Config.DE_FORWARD_APPKEY], false));
            }
        }
        const results = await Promise.all(checkAuthorizations);
        const index = results.indexOf(false);
        if (results.indexOf(false) !== -1) {
            const readMex = tokenBody.resources[index].readonly ? 'read' : 'write';
            const sprojMex = Config.SDPATHPREFIX + tokenBody.resources[index].resource;
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'User is not ' + readMex + 'authorized in the ' + sprojMex + ' subproject resource.'));
        }

        // generate the imp token
        return await ImpTokenDAO.create(tokenBody);

    }

    // refresh an impersonation token
    private static async refresh(req: expRequest): Promise<ImpTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpTokenModel;

        // parse the request input and retrieve the token
        const tokenToRefresh = ImpTokenParser.refresh(req);

        // validate the refresh token
        const tokenToRefreshBody = await ImpTokenDAO.validate(tokenToRefresh, true);

        // check if it can be refreshed
        await ImpTokenDAO.canBeRefreshed(tokenToRefreshBody.refreshUrl);

        // generate a new impersonation token
        return await ImpTokenDAO.create(tokenToRefreshBody);

    }

    // patch an impersonation token
    private static async patch(req: expRequest): Promise<ImpTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpTokenModel;

        const result = await ImpTokenParser.patch(req);
        const tokenToPach = result.tokenToPatch;
        const refreshUrl = result.refreshUrl;

        // validate the refresh token
        const tokenToPachBody = await ImpTokenDAO.validate(tokenToPach);

        // generate a new impersonation token with a new refresh url
        tokenToPachBody.refreshUrl = refreshUrl;
        return await ImpTokenDAO.create(tokenToPachBody);

    }

}
