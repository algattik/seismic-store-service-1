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
import { Auth, AuthProviderFactory } from '../../auth';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Cache, Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { SubProjectDAO } from '../subproject';
import { TenantDAO } from '../tenant';
import { ImpersonationTokenModel, ImpersonationTokenDataModel, ImpersonationTokenResourceModel } from './model';
import { ImpersonationTokenOps } from './optype';
import { ImpersonationTokenParser } from './parser';
import { createHash } from 'crypto';
import { ITenantModel } from '../tenant/model';

export class ImpersonationTokenHandler {

    private static _cache = new Cache<ImpersonationTokenResourceModel[]>('imptoken_sign');
    private static _cacheTTL = 300; // 5 minutes

    // handler for the [ /impersonation-token ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: ImpersonationTokenOps) {
        try{
            if (op === ImpersonationTokenOps.Generate) {
                Response.writeOK(res, await this.generate(req));
            } else if (op === ImpersonationTokenOps.Refresh) {
                Response.writeOK(res, await this.refresh(req));
            } else if (op === ImpersonationTokenOps.DeleteSignatures) {
                Response.writeOK(res, await this.deleteSignatures(req));
            } else if (op === ImpersonationTokenOps.GetSignatures) {
                Response.writeOK(res, await this.getSignatures(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }
        } catch (error) { Response.writeError(res, error); }

    }

    // generate an impersonation token
    private static async generate(req: expRequest): Promise<ImpersonationTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        const requestBody = await ImpersonationTokenParser.generate(req);
        const tenantName = requestBody.resources[0].resource.split('/')[0];
        const tenant = await TenantDAO.get(tenantName);
        const subject = Utils.getSubFromPayload(req.headers.authorization);

        // check if the caller is a trusted application (subject, email(obsolete), emailV2(obsolete))
        try {
            await Auth.isAppAuthorized(tenant, subject);
        } catch (error) {
            const appEmail = await SeistoreFactory.build(
                Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, false);
            try {
                await Auth.isAppAuthorized(tenant, appEmail);
            } catch (error) {
                const appEmailV2 = Utils.checkSauthV1EmailDomainName(appEmail);
                if (appEmailV2 !== appEmail) {
                    await Auth.isAppAuthorized(tenant, appEmailV2);
                } else {
                    throw(error);
                }
            }
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // check if the user is authorized on access the requested resource
        const authorizationCheckList = [];
        for (const item of requestBody.resources) {

            // retrieve the destination subproject info (resource is tenantName[0]/subprojectName[1])
            const subproject = await SubProjectDAO.get(journalClient, tenant.name, item.resource.split('/')[1]);

            if (item.readonly) {
                authorizationCheckList.push(
                    Auth.isReadAuthorized(
                        requestBody.userToken.startsWith('Bearer') ?
                            requestBody.userToken :
                            'Bearer ' + requestBody.userToken,
                        subproject.acls.viewers.concat(subproject.acls.admins),
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY], false));
            } else {
                authorizationCheckList.push(
                    Auth.isWriteAuthorized(
                        requestBody.userToken.startsWith('Bearer') ?
                            requestBody.userToken :
                            'Bearer ' + requestBody.userToken,
                        subproject.acls.admins,
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY], false));
            }
        }
        const results = await Promise.all(authorizationCheckList);
        const index = results.indexOf(false); // error if find at least one not unauthorized
        if (results.indexOf(false) !== -1) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'User is not ' + (requestBody.resources[index].readonly ? 'read' : 'write')
                + ' authorized in the ' + Config.SDPATHPREFIX +
                requestBody.resources[index].resource + ' subproject resource.'));
        }

        // generate the impersonation token credential token (the auth credential)
        const impersonationToken = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).convertToImpersonationTokenModel(
                await AuthProviderFactory.build(
                    Config.SERVICE_AUTH_PROVIDER).generateAuthCredential());

        // Save the impersonation token signature with meta-information in the catalogue
        const data = {
            created_by: subject,
            created_date: new Date().toString(),
            metadata: requestBody.metadata,
            resources: requestBody.resources,
            signature: this.computeSignature(impersonationToken.impersonation_token)
        } as ImpersonationTokenDataModel;
        const key = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, data.signature],
        });
        await journalClient.save({ data, key });

        // Save them in cache too (for fast retrieval)
        await this._cache.set(data.signature, data.resources, this._cacheTTL);

        // Done
        return impersonationToken;
    }

    // refresh the impersonation token
    private static async refresh(req: expRequest): Promise<ImpersonationTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        // parse the request input and retrieve the token
        const requestParams = ImpersonationTokenParser.refresh(req);
        const tenant = await TenantDAO.get(requestParams.tenantName);

        // the impersonation token must be valid and active
        if(!(await this.hasActiveSignature(tenant, requestParams.token))) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The impersonation token is not valid or not active (retired)'));
        }

        // get the impersonation token data
        const data = await this.getImpersonationTokenData(tenant, requestParams.token);

        // generate a new impersonation token credential token (the auth credential)
        const impersonationToken = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).convertToImpersonationTokenModel(
                await AuthProviderFactory.build(
                    Config.SERVICE_AUTH_PROVIDER).generateAuthCredential());

        // the metadata will now have a new signature, update and save in catalogue and cache
        data.signature = this.computeSignature(impersonationToken.impersonation_token);
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const key = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, data.signature],
        });
        await journalClient.save({ data, key });
        await this._cache.set(data.signature, data.resources, this._cacheTTL);

        // remove the old entry from catalogue and cache
        const retiredSignature = this.computeSignature(requestParams.token);
        await journalClient.delete(journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, retiredSignature],
        }));
        await this._cache.del(retiredSignature);

        // Done
        return impersonationToken;

    }

    // delete impersonation token signatures
    private static async deleteSignatures(req: expRequest): Promise<any> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        // parse the request input and retrieve the token
        const requestParams = ImpersonationTokenParser.deleteSignatures(req);
        const tenant = await TenantDAO.get(requestParams.tenantName);

        // the impersonation token if present must be valid and active
        if(requestParams.token) {
            if(!(await this.hasActiveSignature(tenant, requestParams.token))) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The impersonation token is not valid or not active (retired)'));
            }
        }

        // compute the signatures list = input signatures + input token signature
        let signatures: string[] = []
        if(requestParams.token) {
            signatures = signatures.concat(this.computeSignature(requestParams.token));
        }
        if (requestParams.signatures) {
            signatures = signatures.concat(requestParams.signatures);
        }

        // delete signatures from catalogue
        const deleteDataOps = [];
        const journalClient = JournalFactoryTenantClient.get(tenant);
        signatures.forEach(signature => {
            deleteDataOps.push(journalClient.delete(journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, signature],
            })));
        });
        await Promise.all(deleteDataOps);

        // delete signature from cache
        const deleteCacheOps = [];
        signatures.forEach(signature => {
            deleteCacheOps.push(this._cache.del(signature));
        });
        await Promise.all(deleteCacheOps);

        // Done

    }

    // get impersonation token signatures
    private static async getSignatures(req: expRequest): Promise<any> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        // parse the request input and retrieve the token
        const tenantName = ImpersonationTokenParser.getSignatures(req);
        const tenant = await TenantDAO.get(tenantName);

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + tenant.name, Config.IMPERSONATION_TOKEN_SIGNATURE_KIND)
            .filter('created_by', Utils.getSubFromPayload(req.headers.authorization));
        const [results] = await journalClient.runQuery(query);
        return results;

    }

    // generate the impersonation token signatures
    private static computeSignature(impersonationToken: string): string {
        return createHash('sha256').update(impersonationToken, 'utf8').digest('hex');
    }

    // retrieve the impersonation token data from the catalogue
    public static async getImpersonationTokenData(
        tenant: ITenantModel, token: string): Promise<ImpersonationTokenDataModel> {

        token = token.startsWith('Bearer') ? token.substr('Bearer '.length) : token
        const signature = this.computeSignature(token);

        // get the entity from the catalogue
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const key = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, signature],
        });
        const [entity] = await journalClient.get(key);

        if(entity) {
            await this._cache.set(signature, entity.resources, this._cacheTTL);
            return entity;
        } else {
            return undefined;
        }

    }

    // check if the impersonation token has a valid and active signature
    public static async hasActiveSignature(
        tenant: ITenantModel, token: string): Promise<boolean> {

        token = token.startsWith('Bearer') ? token.substr('Bearer '.length) : token
        const signature = this.computeSignature(token);

        const res = await this._cache.get(signature);
        if (res !== undefined && res) { return true };

        // get the entity from the catalogue
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const key = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.IMPERSONATION_TOKEN_SIGNATURE_KIND, signature],
        });
        const [entity] = await journalClient.get(key);

        return entity !== undefined;

    }

}
