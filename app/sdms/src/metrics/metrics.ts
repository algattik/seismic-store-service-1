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


// TODO This code should be removed and we should rely on the provider metrics generator (trace for google)

import { AggregationType, globalStats, MeasureUnit, TagMap } from '@opencensus/core';
import { StackdriverStatsExporter } from '@opencensus/exporter-stackdriver';
import { ConfigGoogle } from '../cloud/providers/google';
import { Feature, FeatureFlags } from '../shared';

const errorCodeTagKey = { name: 'code' };

if (FeatureFlags.isEnabled(Feature.STACKDRIVER_EXPORTER)) {
    // this will be undefined for all other providers
    const exporter = new StackdriverStatsExporter({ projectId: ConfigGoogle.SERVICE_CLOUD_PROJECT });
    globalStats.registerExporter(exporter);
}

// Entitlement Service
const entitlementResError = globalStats.createMeasureInt64(
    'seismic-store/EntitlementResERROR', MeasureUnit.UNIT, 'The number entitlement responses with error status');
const entitlementLatency = globalStats.createMeasureDouble(
    'seismic-store/EntitlementLatency', MeasureUnit.MS, 'The entitlement service response latencies');

// Compliance Service
const complianceResError = globalStats.createMeasureInt64(
    'seismic-store/ComplianceResERROR', MeasureUnit.UNIT, 'The number compliance responses with error status');
const complianceLatency = globalStats.createMeasureDouble(
    'seismic-store/ComplianceLatency', MeasureUnit.MS, 'The compliance service response latencies');

// Storage Service
const storageResError = globalStats.createMeasureInt64(
    'seismic-store/StorageResERROR', MeasureUnit.UNIT, 'The number storage responses with error status');
const storageLatency = globalStats.createMeasureDouble(
    'seismic-store/StorageLatency', MeasureUnit.MS, 'The storage service response latencies');

// Entitlement Views

const entitlementViewError = globalStats.createView(
    'seismic-store/entitlement-status-error',
    entitlementResError,
    AggregationType.COUNT,
    [errorCodeTagKey],
    'The number entitlement responses with error status',
);

const entitlementViewLatency = globalStats.createView(
    'seismic-store/entitlement-latency',
    entitlementLatency,
    AggregationType.DISTRIBUTION,
    [],
    'The distribution of the latencies',
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 2000, 3000, 4000],
);

globalStats.registerView(entitlementViewError);
globalStats.registerView(entitlementViewLatency);

// Compliance Views

const complianceViewError = globalStats.createView(
    'seismic-store/compliance-status-error',
    complianceResError,
    AggregationType.COUNT,
    [errorCodeTagKey],
    'The number compliance responses with error status',
);

const complianceViewLatency = globalStats.createView(
    'seismic-store/compliance-latency',
    complianceLatency,
    AggregationType.DISTRIBUTION,
    [],
    'The distribution of the latencies',
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 2000, 3000, 4000],
);

globalStats.registerView(complianceViewError);
globalStats.registerView(complianceViewLatency);

// Storage Views

const storageViewError = globalStats.createView(
    'seismic-store/storage-status-error',
    storageResError,
    AggregationType.COUNT,
    [errorCodeTagKey],
    'The number storage responses with error status',
);

const storageViewLatency = globalStats.createView(
    'seismic-store/storage-latency',
    storageLatency,
    AggregationType.DISTRIBUTION,
    [],
    'The distribution of the latencies',
    [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 2000, 3000, 4000],
);

globalStats.registerView(storageViewError);
globalStats.registerView(storageViewLatency);

// Record Functions

export enum DESService { ENTITLEMENT, COMPLIANCE, STORAGE, CCM_USER_ASSOCIATION_SVC }

export function recordError(code: number, service: DESService) {
    const tags = new TagMap();
    if (code >= 400 && code <= 499) {
        tags.set(errorCodeTagKey, { value: '4xx' });
    } else if (code >= 500 && code <= 599) {
        tags.set(errorCodeTagKey, { value: '5xx' });
    } else {
        tags.set(errorCodeTagKey, { value: String(code) });
    }

    let measureTemp;
    if (service === DESService.ENTITLEMENT) {
        measureTemp = entitlementResError;
    } else if (service === DESService.COMPLIANCE) {
        measureTemp = complianceResError;
    } else {
        measureTemp = storageResError;
    }

    globalStats.record([{
        measure: measureTemp,
        value: 1,
    }], tags);
}

export class RecordLatency {

    private hrstart: any;

    constructor() {
        this.hrstart = process.hrtime();
    }

    public record(service: DESService) {

        let measureTemp;
        if (service === DESService.ENTITLEMENT) {
            measureTemp = entitlementLatency;
        } else if (service === DESService.COMPLIANCE) {
            measureTemp = complianceLatency;
        } else {
            measureTemp = storageLatency;
        }

        const hrend = process.hrtime(this.hrstart);
        globalStats.record([{
            measure: measureTemp,
            value: hrend[0] * 1000 + hrend[1] / 1000000,
        }]);
    }

}
