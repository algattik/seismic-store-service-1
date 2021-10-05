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

import request from 'request-promise';

import { Config, DataEcosystemCoreFactory } from '../cloud';
import { IDESEntitlementGroupModel, IDESEntitlementMemberModel } from '../cloud/dataecosystem';
import { Error } from '../shared';

export class DESEntitlement {

    public static async listUsersInGroup(
        userToken: string, group: string, dataPartitionID: string, appkey: string,
        prevCursor?: string): Promise<{ members: IDESEntitlementMemberModel[], nextCursor: string; }> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json',
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + group + '/members',
        };

        if (prevCursor !== undefined) { options.url += ('?cursor=' + prevCursor); }

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            const res = dataecosystem.fixGroupMembersResponse(JSON.parse(await request.get(options)));
            const members = res.members;
            const nextCursor = res.cursor;
            return { members, nextCursor };

        } catch (error) {

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
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups',
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            const results = await request.get(options);
            return JSON.parse(results).groups;

        } catch (error) {

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }

    }

    // ensure strong consistency on cascade operation createGroup -> addMEmber
    // in seismic-dms when a subproject is create an extra admin user can also added to the created group
    // because of the imposed eventual consistency on createGroup (mex declared latency ~2s) we should ensure
    // a small retry logic is applied around the call on the returned error message
    // { "code": 404, "reason": "Not Found" }
    public static async addUserToGroup(
        userToken: string, groupName: string, dataPartitionID: string, userEmail: string,
        role: string, appkey: string, checkConsistencyForCreateGroup = false) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            json: undefined,
            url: Config.DES_SERVICE_HOST_ENTITLEMENT
                + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members',
        };

        options.json = dataecosystem.getUserAddBodyRequest(userEmail, role);

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            // let's have a simple linear retry backOff with 1s wait time between iterations
            // to ensure the group is created before add a user (if explicitly required)
            let counter = 0;
            while (counter < 10) {
                try {
                    await request.post(options);
                    return;
                } catch (error) { // check eventual consistency
                    if (!(checkConsistencyForCreateGroup && error && error.error &&
                        error.error.code && error.error.code === 404 &&
                        error.error.reason && (error.error.reason as string).toLocaleLowerCase() === 'not found')) {
                        throw (error);
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 1000)); // wait 1s constant (no exp backOff required)
                counter = counter + 1;
            }

        } catch (error) {

            if (error.statusCode === 409) {

                let usersList = [];
                let result = await DESEntitlement.listUsersInGroup(userToken, groupName, dataPartitionID, appkey);

                usersList = result.members;

                while (result.nextCursor) {
                    result = await DESEntitlement.listUsersInGroup(userToken, groupName, dataPartitionID, appkey);
                    usersList = [...usersList, ...result.members];
                }

                const existingUserRole = usersList.filter(user => user.email === userEmail)[0].role;

                if (existingUserRole !== role) {
                    throw (Error.make(Error.Status.ALREADY_EXISTS,
                        'User already exists but the role is not set to ' + role + ', so delete the user and re-add'));
                }
                return;
            }

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

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
            url: Config.DES_SERVICE_HOST_ENTITLEMENT
                + dataecosystem.getEntitlementBaseUrlPath() + '/groups/' + groupName + '/members/' + userEmail,
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            await request.delete(options);

        } catch (error) {

            if (error.statusCode !== 409) {
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
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath() + '/groups',
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            await request.post(options);

        } catch (error) {

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }

    }

    public static async deleteGroup(userToken: string, groupEmail: string, dataPartitionID: string, appkey: string) {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Authorization': userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken,
                'Content-Type': 'application/json'
            },
            url: Config.DES_SERVICE_HOST_ENTITLEMENT + dataecosystem.getEntitlementBaseUrlPath()
                + Config.DES_ENTITLEMENT_DELETE_ENDPOINT_PATH + groupEmail
        };

        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            await request.delete(options);

        } catch (error) {

            throw (Error.makeForHTTPRequest(error, '[entitlement-service]'));

        }

    }

}
