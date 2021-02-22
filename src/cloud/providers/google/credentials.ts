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

import jwttoken from 'jsonwebtoken';
import request from 'request-promise';

import { Config } from '../../../cloud';
import { Error, Utils } from '../../../shared';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { ConfigGoogle } from './config';

interface IDTokenModel {
    id_token: string;
}

interface IDownScopedToken {
    access_token: string;
    token_type: string;
    issued_token_type: string;
}

const KExpiresMargin = 300; // 5 minutes

@CredentialsFactory.register('google')
export class Credentials extends AbstractCredentials {

    public async getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, _partition: string): Promise<IAccessTokenModel> {
        return {
            access_token: (
                await this.exchangeJwtWithDownScopedAccessToken(
                    (await this.getServiceAccountAccessToken()).access_token, bucket, readonly)).access_token,
            expires_in: 3599,
            token_type: 'Bearer',
        };
    }

    private async exchangeJwtWithDownScopedAccessToken(accessToken: string,
        bucket: string, readonly: boolean): Promise<IDownScopedToken> {
        try {
            return JSON.parse(await request.post({
                form: {
                access_boundary: JSON.stringify({
                    accessBoundaryRules : [{
                        availablePermissions: [
                            'inRole:roles/' + (readonly ? 'storage.objectViewer' : 'storage.objectAdmin') ],
                        availableResource : '//storage.googleapis.com/projects/_/buckets/' + bucket,
                    }],
                }),
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                subject_token: accessToken,
                subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                },
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                },
                url: 'https://securetoken.googleapis.com/v2beta1/token',
            }));
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public async getServiceCredentials(): Promise<string> {

        const now = Math.floor(Date.now() / 1000);
        if (this.serviceAccountIdTokenExpiresIn > now) {
            return this.serviceAccountIdToken;
        }

        this.serviceAccountEmail = await this.getServiceAccountEmail();
        const svcToken = (await this.getServiceAccountAccessToken()).access_token;

        const options = {
            form: {
                payload: JSON.stringify({
                    aud: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
                    exp: (now + 3600),
                    iat: now,
                    iss: this.serviceAccountEmail,
                    target_audience: ConfigGoogle.DES_SERVICE_TARGET_AUDIENCE,
                }),
            },
            headers: {
                'Authorization': 'Bearer ' + svcToken,
                'Content-Type': 'application/json',
            },
            url: ConfigGoogle.GOOGLE_EP_IAM + '/projects/' +
                ConfigGoogle.SERVICE_CLOUD_PROJECT + '/serviceAccounts/' + this.serviceAccountEmail + ':signJwt',
        };

        try {
            const idToken = await this.signJWT(
                JSON.parse(await request.post(options)).signedJwt) as IDTokenModel;

            this.serviceAccountIdToken = idToken.id_token;
            this.serviceAccountIdTokenExpiresIn =
                Utils.getExpTimeFromPayload(this.serviceAccountIdToken) - KExpiresMargin;

            return this.serviceAccountIdToken;

        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }

    }

    public async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {

        const now = Math.floor(Date.now() / 1000);
        if (this.serviceAccountAccessToken && this.serviceAccountAccessTokenExpiresIn > now) {
            return this.serviceAccountAccessToken;
        }

        if (ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY) {
            const jwt = jwttoken.sign({
                aud: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
                exp: (now + 3600),
                iat: now,
                iss: ConfigGoogle.SERVICE_IDENTITY_EMAIL,
                scope: ConfigGoogle.GOOGLE_SCOPE_PLATFORM,
            }, ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY, {
                header: {
                    alg: 'RS256',
                    kid: ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY_ID,
                    typ: 'JWT',
                },
            });

            this.serviceAccountAccessToken = await this.signJWT(jwt) as IAccessTokenModel;
            this.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + this.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return this.serviceAccountAccessToken;
        }

        const options = {
            headers: { 'Metadata-Flavor': 'Google' },
            url: ConfigGoogle.GOOGLE_EP_METADATA + '/instance/service-accounts/default/token',
        };

        try {
            this.serviceAccountAccessToken = JSON.parse(await request.get(options));
            this.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + this.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return this.serviceAccountAccessToken;
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public async getServiceAccountEmail(): Promise<string> {

        if (this.serviceAccountEmail) { return this.serviceAccountEmail; }

        if (ConfigGoogle.SERVICE_IDENTITY_EMAIL) {
            this.serviceAccountEmail = ConfigGoogle.SERVICE_IDENTITY_EMAIL;
            return this.serviceAccountEmail;
        }

        const options = {
            headers: { 'Metadata-Flavor': 'Google' },
            url: ConfigGoogle.GOOGLE_EP_METADATA + '/instance/service-accounts/default/email',
        };

        try {
            return await request.get(options);
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public getIAMResourceUrl(serviceSigner: string): string {
        return ConfigGoogle.GOOGLE_EP_IAM + '/projects/' + ConfigGoogle.SERVICE_CLOUD_PROJECT +
            '/serviceAccounts/' + serviceSigner + ':signJwt';
    }

    public getAudienceForImpCredentials(): string {
        return ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token';
    }

    public getPublicKeyCertificatesUrl(): string {
        return ConfigGoogle.GOOGLE_EP_ROBOT + '/metadata/x509/' + Config.IMP_SERVICE_ACCOUNT_SIGNER;
    }

    // cache the services tokens
    private serviceAccountEmail: string;
    private serviceAccountAccessToken: IAccessTokenModel;
    private serviceAccountAccessTokenExpiresIn = 0;
    private serviceAccountIdToken: string;
    private serviceAccountIdTokenExpiresIn = 0;

    public async signJWT(jwt: string): Promise<IDTokenModel | IAccessTokenModel> {

        const options = {
            form: {
                assertion: jwt,
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            url: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
        };

        try {
            return JSON.parse(await request.post(options));
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }

    }

}
