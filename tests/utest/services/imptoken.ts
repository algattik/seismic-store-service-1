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
import jwt from 'jsonwebtoken';
import request from 'request-promise';
import sinon from 'sinon';

import { google } from '../../../src/cloud';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth } from '../../../src/auth';
import { Config } from '../../../src/cloud';
import { ImpTokenDAO } from '../../../src/services/imptoken';
import { ImpTokenHandler } from '../../../src/services/imptoken/handler';
import { IImpTokenBodyModel as ImpTokenBodyModel, IResourceModel } from '../../../src/services/imptoken/model';
import { ImpTokenOP } from '../../../src/services/imptoken/optype';
import { ImpTokenParser } from '../../../src/services/imptoken/parser';
import { TenantDAO } from '../../../src/services/tenant';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';

export class TestImpTokenSVC {
    public static userAuthExp: string;
    public static userAuthExp0: string;
    public static impToken: string;
    public static impTokenNoValid: string;
    public static requestError: object;

    public static run() {

        Config.IMP_SERVICE_ACCOUNT_SIGNER = 'signer@seistore.com';

        const payloadOK = {
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER, obo: 'user',
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        const payloadWrongIss = {
            iss: 'unkown', obo: 'user',
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        const payloadWrong = {
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        this.tokenOK = jwt.sign(payloadOK, 'mysecret', { keyid: '0' });
        this.tokenNoKid = jwt.sign(payloadOK, 'mysecret');
        this.tokenWrongIss = jwt.sign(payloadWrongIss, 'mysecret', { keyid: '0' });
        this.tokenWrong = jwt.sign(payloadWrong, 'mysecret', { keyid: '0' });

        this.userAuthExp = 'header.' + Buffer.from(JSON.stringify({
            email: 'user@user.com', exp: Date.now(),
        })).toString('base64') + '.signature';

        this.userAuthExp0 = 'header.' + Buffer.from(JSON.stringify({
            email: 'user@user.com', exp: 0,
        })).toString('base64') + '.signature';

        this.impToken = 'header.' + Buffer.from(JSON.stringify({
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER, obo: 'obo', rsrc: 'rsrc',
            rurl: 'rurl',
        })).toString('base64') + '.signature';

        this.impTokenNoValid = 'header.' + Buffer.from(JSON.stringify({
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
            obo: 'obo', rsrc: 'rsrc',
        })).toString('base64') + '.signature';

        this.requestError = { name: 'StatusCodeError', statusCode: 500, message: 'error' };

        describe(Tx.testInit('imptoken'), () => {

            beforeEach(() => {
                this.spy = sinon.createSandbox();
                this.spy.stub(Response, 'writeMetric').returns();
            });
            afterEach(() => { this.spy.restore(); });

            this.create();
            this.refresh();
            this.patch();
            this.others();

        });

    }

    private static spy: sinon.SinonSandbox;
    private static tokenOK: string;
    private static tokenNoKid: string;
    private static tokenWrongIss: string;
    private static tokenWrong: string;

    private static create() {

        Tx.sectionInit('create');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(true);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: false, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp0;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [
                { readonly: true, resource: 'sd://tnx1/spx' }, { readonly: true, resource: 'sd://tnx2/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [
                { readonly: true, resource: 'sd://tnx/spx1' },
                { readonly: false, resource: 'sd://tnx/spx1' },
                { resource: 'sd://tnx/spx2' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            ImpTokenParser.create(expReq);
            done();
        });

        Tx.test(async (done: any) => {
            this.spy.stub(google.Credentials.prototype, 'getServiceAccountAccessToken').resolves({
                access_token: 'token', expires_in: 3600, token_type: 'Bearer'
            });
            this.spy.stub(jwt, 'sign').resolves('jwt-token');
            this.spy.stub(request, 'get').resolves('{\"signedJwt\": \"token\"}');
            this.spy.stub(request, 'post').resolves('{\"signedJwt\": \"token\"}');
            const resouceModel: IResourceModel = {
                readonly: false,
                resource: 'resource',
            };
            const impToken: ImpTokenBodyModel = {
                iat: undefined,
                refreshUrl: 'url',
                resources: [resouceModel],
                user: 'userA',
                userToken: 'token',
            };
            await ImpTokenDAO.create(impToken);
            done();
        });

        Tx.test(async (done: any) => {
            this.spy.stub(jwt, 'sign').resolves('jwt-token');
            this.spy.stub(request, 'post').rejects(this.requestError);
            try {
                await ImpTokenDAO.create({ iat: Date.now() } as ImpTokenBodyModel);
            } catch (e) { Tx.check500(e.error.code, done); }
        });
    }

    private static refresh() {

        Tx.sectionInit('refresh');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.impToken;
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(ImpTokenDAO, 'validate').resolves({ refreshUrl: '' } as any);
            this.spy.stub(ImpTokenDAO, 'canBeRefreshed').resolves(undefined);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Refresh);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = 'xxx';
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = expReq.headers.authorization;
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = this.impTokenNoValid;
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves();
            await ImpTokenDAO.canBeRefreshed('https://google.com');
            done();
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').rejects(this.requestError);
            try {
                await ImpTokenDAO.canBeRefreshed('https://url');
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            await ImpTokenDAO.validate(this.tokenOK);
            done();
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').rejects(this.requestError);
            try {
                await ImpTokenDAO.validate(this.tokenOK);
            } catch (e) { Tx.check500(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            try {
                await ImpTokenDAO.validate(this.tokenNoKid);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('[]');
            try {
                await ImpTokenDAO.validate(this.tokenOK);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            this.spy.stub(jwt, 'verify').throws({ name: 'TokenExpiredError' });
            await ImpTokenDAO.validate(this.tokenOK, true);
            done();
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            this.spy.stub(jwt, 'verify').throws({ name: 'TokenExpiredError' });
            try {
                await ImpTokenDAO.validate(this.tokenOK, false);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            try {
                await ImpTokenDAO.validate(this.tokenWrongIss);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.test(async (done: any) => {
            this.spy.stub(request, 'get').resolves('["mysecret"]');
            try {
                await ImpTokenDAO.validate(this.tokenWrong);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static patch() {

        Tx.sectionInit('patch');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.impToken;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(ImpTokenDAO, 'validate').resolves({ refreshUrl: '' } as any);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Patch);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = expReq.headers.authorization;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.patch(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.body.token = this.impTokenNoValid;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.patch(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            await ImpTokenHandler.handler(expReq, expRes, undefined);
            done();
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(Auth, 'isImpersonationToken').returns(true);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Tx.check403(expRes.statusCode, done);
        });

        Tx.test(async (done: any) => {
            ImpTokenDAO.getImpTokenBody(this.tokenOK);
            done();
        });

    }

}
