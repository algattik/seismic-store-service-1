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

import cors from 'cors';
import express from 'express';
import jwtProxy, { JwtProxyOptions } from 'jwtproxy';
import { Config, LoggerFactory } from '../cloud';
import { ServiceRouter } from '../services';
import { Error, Feature, FeatureFlags, Response, Utils } from '../shared';
import { AuthProviderFactory } from '../auth';
import { v4 as uuidv4 } from 'uuid';

import fs from 'fs';
import https from 'https';

import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import replaceInFile from 'replace-in-file';

// -------------------------------------------------------------------
// Seismic Store Service
// -------------------------------------------------------------------
export class Server {

    private app: express.Express;
    private port: number;

    private httpServer: import('http').Server;
    private httpsServer: import('https').Server;

    private corsOptions = {
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
        maxAge: 3600,
        exposedHeaders: [
            'Origin',
            'Content-Type',
            'X-Requested-With',
            'Authorization',
            'Accept',
            'Referer',
            'X-Requested-With',
            'Access-Control-Allow-Origin',
            'x-traffic-manager'
        ],
        allowedHeaders: [
            'Origin',
            'Content-Type',
            'X-Requested-With',
            'Authorization',
            'Accept',
            'Referer',
            'X-Requested-With',
            'Access-Control-Allow-Origin',
            'x-traffic-manager'
        ]
    }

    private optionsDivClear = {
        files: 'node_modules/swagger-ui-dist/swagger-ui.css',
        from: '.swagger-ui .topbar{display:none;visibility:hidden',
        to: '.swagger-ui .topbar{'
    }

    private optionsDivHide = {
        files: 'node_modules/swagger-ui-dist/swagger-ui.css',
        from: '.swagger-ui .topbar{',
        to: '.swagger-ui .topbar{display:none;visibility:hidden;'
    }

    constructor() {

        const swaggerDocument = YAML.load('./dist/docs/api/openapi.osdu.yaml');
        try {
            replaceInFile.sync(this.optionsDivClear);
            replaceInFile.sync(this.optionsDivHide);
        }
        catch (error) {
            console.error('Error occurred:', error);
        }

        this.app = express();
        this.app.use(express.urlencoded({ extended: false }));
        this.app.use(express.json());
        this.app.disable('x-powered-by');
        this.app.use(cors(this.corsOptions));
        this.app.options('*', cors());
        this.app.use('/seistore-svc/api/v3/swagger-ui.html', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
            customCss: '.swagger-ui .topbar { display: none }'
        }));
        this.app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {

            try {
                // Audience Check Reporting
                // This will be temporary used instead of the more generic JWKS PROXY.
                // We want a non-fail check that report only the missing audience
                // slb requirement - to support client migration in september 2021
                // This will be removed and replace in october 2021 with the generic JWKS PROXY
                if (Config.ENABLE_SDMS_ID_AUDIENCE_CHECK) {
                    if (req.headers.authorization) {
                        const audience = Utils.getAudienceFromPayload(req.headers.authorization);
                        const sdmsID = AuthProviderFactory.build(Config.SERVICE_AUTH_PROVIDER).getClientID();
                        if ((Array.isArray(audience) && audience.indexOf(sdmsID) === -1) || (audience !== sdmsID)) {
                            if (audience.indexOf(sdmsID) === -1) {
                                LoggerFactory.build(Config.CLOUDPROVIDER).info('[audience] ' +
                                    JSON.stringify(Utils.getPayloadFromStringToken(req.headers.authorization)));
                            }
                        }
                    }
                }

                // If required, exchange the caller credentials to include the DE target audience
                if (Config.ENABLE_DE_TOKEN_EXCHANGE) {
                    if (Config.DES_TARGET_AUDIENCE) {
                        if (req.headers.authorization) {
                            req.headers.authorization = await AuthProviderFactory.build(
                                Config.SERVICE_AUTH_PROVIDER).exchangeCredentialAudience(
                                    req.headers.authorization, Config.DES_TARGET_AUDIENCE);
                        }
                    }
                }

                // ensure the authorization header is passed/
                // the imptoken refresh method is now obsolete because was not secured.
                // the imptoken endpoints are not enabled in any CSP but temporarily used in SLB only.
                // the imptoken endpoints have been marked as obsoleted and will be deprecated with the
                // next service upgrade (v3>v4)
                if (!req.headers.authorization) {
                    if (!((req.method === 'PUT' && req.url.endsWith('imptoken')) || req.url.endsWith('svcstatus'))) {
                        Response.writeError(res, Error.make(
                            Error.Status.UNAUTHENTICATED,
                            'Unauthenticated Access. Authorizations not found in the request.'));
                        return;
                    }
                }

                // track caller to the main log
                const key = req.headers['x-api-key'] as string;
                const logger = LoggerFactory.build(Config.CLOUDPROVIDER);
                logger.info(
                    ((key && key.length > 5) ? ('[***' + key.substr(key.length - 5) + '] ') : '')
                    + '[' + req.method + '] ' + req.url);

                // init the metrics logger
                if (FeatureFlags.isEnabled(Feature.LOGGING)) {
                    LoggerFactory.build(Config.CLOUDPROVIDER).metric('Request Size',
                        req.headers['content-length'] ? +req.headers['content-length'] : 0)
                }

                // forward the caller appkey if exist
                // if exists ensure it does not collide the google-esp api-key (required for backward compatibility)
                req[Config.DE_FORWARD_APPKEY] =
                    req.headers['appkey'] !== req.headers['x-api-key'] ? req.headers['appkey'] : undefined

                // set the header correlation id and keep a reference in the response locals
                if (Config.CORRELATION_ID) {
                    if (!req.headers[Config.CORRELATION_ID]) {
                        req.headers[Config.CORRELATION_ID] = uuidv4();
                    }
                    res.locals[Config.CORRELATION_ID] = req.headers[Config.CORRELATION_ID];
                }

                next();

            } catch (error) {
                Response.writeError(res, error);
            }
        });

        const jwtValidateOptions: JwtProxyOptions = {
            disable: !Config.JWT_ENABLE_FEATURE,
            excluded: Config.JWT_EXCLUDE_PATHS ? Config.JWT_EXCLUDE_PATHS.split(';') : [],
            jwksUrl: Config.JWKS_URL,
            algorithms: ['RS256'],
            audience: Config.JWT_AUDIENCE
        }

        // adding middleware to intercept and validate jwt
        this.app.use(jwtProxy(jwtValidateOptions));

        this.app.use(ServiceRouter);
    }

    public async start(port = Config.SERVICE_PORT) {

        this.port = port;

        // The timeout of the backend service should be greater than the timeout of the load balancer. This will
        // prevent premature connection closures from the service
        // Additionally, the headers-timeout needs to be greater than keep-alive-timeout
        // https://github.com/nodejs/node/issues/27363

        // SSL
        if (Config.SSL_ENABLED) {
            const privateKey = fs.readFileSync(Config.SSL_KEY_PATH, 'utf8');
            const certificate = fs.readFileSync(Config.SSL_CERT_PATH, 'utf8');
            const credentials = { key: privateKey, cert: certificate };
            this.httpsServer = https.createServer(credentials, this.app).listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpsServer.setTimeout(610000);
            this.httpsServer.keepAliveTimeout = 610 * 1000;
            this.httpsServer.headersTimeout = 611 * 1000;
        } else {
            this.httpServer = this.app.listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpServer.setTimeout(610000);
            this.httpServer.keepAliveTimeout = 610 * 1000;
            this.httpServer.headersTimeout = 611 * 1000;
        }
    }

    public stop() {
        if (this.httpServer) {
            this.httpServer.close();
        }
        if (this.httpsServer) {
            this.httpsServer.close();
        }
    }
}