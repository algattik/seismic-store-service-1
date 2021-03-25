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

import bodyparser from 'body-parser';
import cors from 'cors';
import express from 'express';
import jwtProxy, { JwtProxyOptions } from 'jwtproxy';
import { Config, LoggerFactory } from '../cloud';
import { ServiceRouter } from '../services';
import { Feature, FeatureFlags } from '../shared';

import fs from 'fs';
import https from 'https';

import swaggerUi from 'swagger-ui-express';
import * as swaggerDocument from '../swagger/swagger.json';

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

    constructor() {
        this.app = express();
        this.app.use(bodyparser.urlencoded({ extended: false }));
        this.app.use(bodyparser.json());
        this.app.disable('x-powered-by');
        this.app.use(cors(this.corsOptions));
        this.app.options('*', cors());
        this.app.use('/seistore-svc/api/v3/swagger-ui.html', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
        this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {

            // not required anymore - to verify
            if (req.get('slb-on-behalf-of') !== undefined) {
                req.headers.authorization = req.get('slb-on-behalf-of');
            }

            // track caller to the main log
            const key = req.headers['x-api-key'] as string;
            const logger = LoggerFactory.build(Config.CLOUDPROVIDER);
            logger.info(
                ((key && key.length > 5) ? ('[***' + key.substr(key.length - 5) +  '] ') : '')
                + '[' + req.method + '] ' + req.url);

            // init the metrics logger
            if(FeatureFlags.isEnabled(Feature.LOGGING))  {
                LoggerFactory.build(Config.CLOUDPROVIDER).metric('Request Size',
                    req.headers['content-length'] ? +req.headers['content-length'] : 0)
            }

            // forward the caller appkey if exist
            // if exists ensure it does not collide the google-esp api-key (required for backward compatibility)
            req[Config.DE_FORWARD_APPKEY] =
                req.headers['appkey'] !== req.headers['x-api-key'] ? req.headers['appkey'] : undefined

            next();
        });

        const jwtValidateOptions: JwtProxyOptions = {
            disable: !Config.JWT_ENABLE_FEATURE,
            excluded: Config.JWT_EXCLUDE_PATHS ? Config.JWT_EXCLUDE_PATHS.split(';') : [],
            jwksUrl:Config.JWKS_URL,
            algorithms: ['RS256'],
            audience: Config.JWT_AUDIENCE
        }

        // adding middleware to intercept and valiate jwt
        this.app.use(jwtProxy(jwtValidateOptions));

        this.app.use(ServiceRouter);
    }

    public async start(port = Config.SERVICE_PORT) {
        this.port = port;
        // The timeout of the backend service should be greater than the timeout of the load balancer. This will
        // prevent premature connection closures from the service
        // Additionally, the headerstimeout needs to be greater than keepalivetimeout
        // https://github.com/nodejs/node/issues/27363


        // SSL
        if (Config.SSL_ENABLED){
            const privateKey  = fs.readFileSync(Config.SSL_KEY_PATH, 'utf8');
            const certificate = fs.readFileSync(Config.SSL_CERT_PATH, 'utf8');
            const credentials = {key: privateKey, cert: certificate};
            this.httpsServer = https.createServer(credentials, this.app).listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpsServer.keepAliveTimeout = 65 * 1000;
            this.httpsServer.headersTimeout = 66 * 1000;
        } else {
            this.httpServer = this.app.listen(this.port, () => {
                // tslint:disable-next-line
                console.log(`- Server is listening on port ${this.port}...`);
            });
            this.httpServer.keepAliveTimeout = 65 * 1000;
            this.httpServer.headersTimeout = 66 * 1000;
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
