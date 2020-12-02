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

import request from 'request-promise';

import { Config, DataEcosystemCoreFactory } from '../cloud';
import { IDESEntitlementMemberModel, IDESEntitlementGroupModel } from '../cloud/dataecosystem';
import { DESService, recordError, RecordLatency } from '../metrics';
import { Error } from '../shared';

export class DESEntitlement {

    public static async listUsersInGroup(
        userToken: string, group: string, dataPartitionID: string, appkey: string,
        prevCursor?: string): Promise<{ members: IDESEntitlementMemberModel[], nextCursor: string }> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json',
            },
            url: Config.DES_SERVICE_HOST + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + group + '/members',
        };

        if (prevCursor !== undefined) { options.url += ('?cursor=' + prevCursor); }

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const entitlementLatency = new RecordLatency();

        try {

            const res = dataecosystem.fixGroupMembersResponse(JSON.parse(await request.get(options)));
            entitlementLatency.record(DESService.ENTITLEMENT);

            const members = res.members;
            const nextCursor = res.cursor;
            return { members, nextCursor };

        } catch (error) {

            entitlementLatency.record(DESService.ENTITLEMENT);
            recordError(error.statusCode, DESService.ENTITLEMENT);
            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }
    }

    public static async getUserGroups(
        userToken: string, dataPartitionID: string, appkey: string): Promise<IDESEntitlementGroupModel[]> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            url: Config.DES_SERVICE_HOST + dataecosystem.getEntitlementBaseUrlPath() + '/groups',
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const entitlementLatency = new RecordLatency();

        try {

            const results = await request.get(options);

            entitlementLatency.record(DESService.ENTITLEMENT);

            return JSON.parse(results).groups;

        } catch (error) {

            entitlementLatency.record(DESService.ENTITLEMENT);
            recordError(error.statusCode, DESService.ENTITLEMENT);

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }

    }

    public static async addUserToGroup(
        userToken: string, groupName: string, dataPartitionID: string, userEmail: string,
            role: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            json: undefined,
            url: Config.DES_SERVICE_HOST + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members',
        };

        options.json = dataecosystem.getUserAddBodyRequest(userEmail, role);

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const entitlementLatency = new RecordLatency();

        try {

            await request.post(options);
            entitlementLatency.record(DESService.ENTITLEMENT);

        } catch (error) {

            entitlementLatency.record(DESService.ENTITLEMENT);
            if (error.statusCode !== 409) {
                recordError(error.statusCode, DESService.ENTITLEMENT);
                throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
            }
        }
    }

    public static async removeUserFromGroup(
        userToken: string, groupName: string, dataPartitionID: string, userEmail: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            url: Config.DES_SERVICE_HOST + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members/' + userEmail,
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const entitlementLatency = new RecordLatency();

        try {

            await request.delete(options);
            entitlementLatency.record(DESService.ENTITLEMENT);

        } catch (error) {

            entitlementLatency.record(DESService.ENTITLEMENT);
            if (error.statusCode !== 409) {
                recordError(error.statusCode, DESService.ENTITLEMENT);
                throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));
            }
        }

    }

    public static async createGroup(
        userToken: string, groupName: string, groupDesc: string, dataPartitionID: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            json: {
                description: groupDesc,
                name: groupName,
            },
            url: Config.DES_SERVICE_HOST + dataecosystem.getEntitlementBaseUrlPath() + '/groups',
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        const entitlementLatency = new RecordLatency();

        try {

            await request.post(options);
            entitlementLatency.record(DESService.ENTITLEMENT);

        } catch (error) {

            entitlementLatency.record(DESService.ENTITLEMENT);
            recordError(error.statusCode, DESService.ENTITLEMENT);
            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }

    }

}
