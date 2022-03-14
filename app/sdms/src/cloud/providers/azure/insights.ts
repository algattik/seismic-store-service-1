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
import * as appinsights from 'applicationinsights';
import { Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractLogger, LoggerFactory } from '../../logger';
import { AzureConfig } from './config';


@LoggerFactory.register('azure')
export class AzureInsightsLogger extends AbstractLogger {

    public static logCustomHeaders(envelope, context) {
        const httpRequest = context['http.ServerRequest'];
        if (httpRequest && appinsights.Contracts.domainSupportsProperties(envelope.data.baseData)) {

            // Log the correlation-id
            if ('correlation-id' in httpRequest.headers) {
                envelope.data.baseData.properties['correlation-id'] = httpRequest.headers['correlation-id'];
            }

            // Log party to which the JWT was originally issued
            try {
                const azp = Utils.getAzpFromPayload(httpRequest.headers.authorization);
                if (azp) {
                    envelope.data.baseData.properties['client-id'] = azp;
                }
            } catch (e) {
                console.error('Telemetry process error - unrecognized header format');
                console.error(httpRequest.headers);
                console.error(e);
            }

        }
        return true;
    }

    public static initialize() {
        if (!Config.UTEST && AzureConfig.AI_INSTRUMENTATION_KEY) {
            appinsights.setup(AzureConfig.AI_INSTRUMENTATION_KEY)
                .setAutoDependencyCorrelation(true)
                .setAutoCollectRequests(true)
                .setAutoCollectPerformance(true, true)
                .setAutoCollectExceptions(true)
                .setAutoCollectDependencies(true)
                .setAutoCollectConsole(true)
                .setUseDiskRetryCaching(true)
                .setDistributedTracingMode(appinsights.DistributedTracingModes.AI_AND_W3C);

            appinsights.defaultClient.context.tags[
                appinsights.defaultClient.context.keys.cloudRole] = 'seismic-dms';

            appinsights.defaultClient.addTelemetryProcessor(AzureInsightsLogger.logCustomHeaders);
            appinsights.start();
        }
    }



    public info(data: any): void {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_INFO) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackTrace({ message: JSON.stringify(data) });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }

    public error(data: any): void {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_ERROR) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackException({ exception: data });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }

    public metric(key: string, data: any) {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_METRIC) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackMetric({ name: key, value: data });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }
}
