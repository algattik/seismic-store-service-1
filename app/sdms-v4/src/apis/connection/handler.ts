// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { ComplianceCoreService, EntitlementCoreService, StorageCoreService } from '../../services';
import { Config, CredentialsFactory } from '../../cloud';
import { Error, Response, getInMemoryCacheInstance } from '../../shared';
import { Request as expRequest, Response as expResponse } from 'express';

import { Operation } from './operations';
import { Parser } from './parser';
import crypto from 'crypto';

export class ConnectionsHandler {
    public static async handler(req: expRequest, res: expResponse, op: Operation) {
        const dataPartition = req.headers[Config.DATA_PARTITION_ID] as string;
        try {
            if (op === Operation.GetUploadConnectionString) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, false));
            } else if (op === Operation.GetDownloadConnectionString) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, true));
            } else if (op === Operation.GetUploadConnectionStringForDatasetVersion) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, false));
            } else if (op === Operation.GetDownloadConnectionStringForDatasetVersion) {
                Response.writeOK(res, await this.getConnectionString(req, dataPartition, true));
            }
        } catch (error) {
            console.log(error);
            Response.writeError(res, error);
        }
    }

    private static async getConnectionString(req: expRequest, dataPartition: string, readonly: boolean) {
        const recordId = Parser.getParamRecordId(req);
        const recordVersion = Parser.getParamRecordVersion(req);
        const storageRecord = await StorageCoreService.getRecord(
            req.headers.authorization,
            recordId,
            dataPartition,
            recordVersion
        );

        const legalTags = storageRecord['legal']['legaltags'];
        for (const legalTag of legalTags) {
            await this.isLegalTagValid(req.headers.authorization, legalTag, dataPartition);
        }

        const viewers = storageRecord['acl']['owners'] as string[];
        const owners = storageRecord['acl']['viewers'] as string[];
        this.isAccessAuthorized(
            req.headers.authorization,
            dataPartition,
            readonly ? viewers.concat(owners) : owners,
            recordId,
            readonly ? 'viewer' : 'admin',
            recordVersion
        );

        const hash = crypto
            .createHash('sha512')
            .update(storageRecord['data']['DatasetProperties']['FileCollectionPath'])
            .digest('hex')
            .substring(0, 12);
        const bucketId = recordId.split(':').at(-1) + '-' + hash;
        const storageCredentials = await CredentialsFactory.build(Config.CLOUD_PROVIDER, {
            dataPartition,
        }).getStorageCredentials(bucketId, readonly, dataPartition);
        return storageCredentials;
    }

    private static async isLegalTagValid(userToken: string, legalTag: string, dataPartition: string): Promise<boolean> {
        const isValid = await ComplianceCoreService.isLegalTagValid(userToken, legalTag, dataPartition);
        if (!isValid) {
            throw Error.make(
                Error.Status.NOT_FOUND,
                'The record legal tag "' + legalTag + '" is not valid or expired.'
            );
        }
        return isValid;
    }

    public static async isAccessAuthorized(
        userToken: string,
        dataPartition: string,
        authGroups: string[],
        recordId: string,
        authRole: string,
        recordVersion?: string
    ): Promise<boolean> {
        const cache = getInMemoryCacheInstance();
        const userTokenSHA = crypto.createHash('sha1').update(userToken).digest('base64');
        const cacheKey = userTokenSHA + ':' + authRole + ':' + recordId + (recordVersion ? ':' + recordVersion : '');

        const cacheResult = cache.get<boolean>(cacheKey);
        if (cacheResult) {
            return cacheResult;
        }

        const groups = await EntitlementCoreService.getUserGroups(userToken, dataPartition);
        const result = authGroups.some((authGroup) => groups.map((group) => group.email).includes(authGroup));
        if (!result) {
            throw Error.make(Error.Status.PERMISSION_DENIED, 'User not authorized to perform this operation');
        }

        cache.set<boolean>(cacheKey, result, 60);
        return result;
    }
}
