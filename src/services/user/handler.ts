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

import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthGroups, AuthRoles } from '../../auth';
import { Config } from '../../cloud';
import { JournalFactoryTenantClient } from '../../cloud/journal';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { SubProjectDAO, SubprojectGroups } from '../subproject';
import { TenantDAO, TenantGroups } from '../tenant';
import { UserOP } from './optype';
import { UserParser } from './parser';

export class UserHandler {

    // handler for the [ /user ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: UserOP) {

        try {

            // subproject endpoints are not available with impersonation token
            if (Auth.isImpersonationToken(req.headers.authorization)) {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'user endpoints not available with an impersonation token as Auth credentials.'));
            }

            if (op === UserOP.Add) {
                Response.writeOK(res, await this.addUser(req));
            } else if (op === UserOP.Remove) {
                Response.writeOK(res, await this.removeUser(req));
            } else if (op === UserOP.List) {
                Response.writeOK(res, await this.listUsers(req));
            } else if (op === UserOP.Roles) {
                Response.writeOK(res, await this.rolesUser(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) { Response.writeError(res, error); }

    }

    // add a user to a tenant or a subproject
    private static async addUser(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.AUTHORIZATION)) return {};

        // parse user request
        const userInput = UserParser.addUser(req);
        const sdPath = userInput.sdPath;
        let userEmail = userInput.email;
        const userGroupRole = userInput.groupRole;

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com.t
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        userEmail = Utils.checkSauthV1EmailDomainName(userEmail);

        // retrieve the tenant informations
        const tenant = await TenantDAO.get(sdPath.tenant);

        if (sdPath.subproject) {

            const serviceGroupRegex = new RegExp('service.seistore.' + Config.SERVICE_ENV
                + '.' + sdPath.tenant + '.' + sdPath.subproject)
            const dataGroupRegex = new RegExp(Config.DATAGROUPS_PREFIX + '.' + sdPath.tenant + '.' + sdPath.subproject)


            const journalClient = JournalFactoryTenantClient.get(tenant);
            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, sdPath.subproject],
            });

            const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject, spkey);

            const subprojectServiceGroups = subproject.acls.admins.filter((group) => group.match(serviceGroupRegex))


            const adminSubprojectDataGroups = subproject.acls.admins.filter((group) => group.match(dataGroupRegex))
            const viewerSuprojectDataGroups = subproject.acls.viewers.filter(group => group.match(dataGroupRegex))

            const subprojectDataGroups = adminSubprojectDataGroups.concat(viewerSuprojectDataGroups)

            if (subprojectServiceGroups.length > 0) {

                if (userGroupRole === AuthRoles.admin) {

                    // First rm the user from the groups since the user can be exclus Owner or Member
                    await this.doNotThrowIfNotMember(
                        AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.serviceAdminGroup(
                            tenant.name, sdPath.subproject, tenant.esd), userEmail,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                    await this.doNotThrowIfNotMember(
                        AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.serviceEditorGroup(
                            tenant.name, sdPath.subproject, tenant.esd), userEmail,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                    await this.doNotThrowIfNotMember(
                        AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.serviceViewerGroup(
                            tenant.name, sdPath.subproject, tenant.esd), userEmail,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY]));

                    await AuthGroups.addUserToGroup(req.headers.authorization,
                        SubprojectGroups.serviceAdminGroup(tenant.name,
                            sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

                    await AuthGroups.addUserToGroup(req.headers.authorization,
                        SubprojectGroups.serviceEditorGroup(tenant.name,
                            sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

                    await AuthGroups.addUserToGroup(req.headers.authorization,
                        SubprojectGroups.serviceViewerGroup(tenant.name,
                            sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

                } else if (userGroupRole === AuthRoles.editor) {

                    await AuthGroups.addUserToGroup(
                        req.headers.authorization,
                        SubprojectGroups.serviceEditorGroup(tenant.name, sdPath.subproject, tenant.esd),
                        userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

                } else if (userGroupRole === AuthRoles.viewer) {

                    await AuthGroups.addUserToGroup(
                        req.headers.authorization,
                        SubprojectGroups.serviceViewerGroup(tenant.name, sdPath.subproject, tenant.esd),
                        userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

                } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

            }

            if (subprojectDataGroups.length > 0) {

                for (const datagroup of subprojectDataGroups) {
                    await this.doNotThrowIfNotMember(
                        AuthGroups.removeUserFromGroup(req.headers.authorization, datagroup, userEmail,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY]));

                    if (userGroupRole === AuthRoles.admin || userGroupRole === AuthRoles.editor) {
                        await AuthGroups.addUserToGroup(req.headers.authorization,
                            datagroup, userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

                    } else {
                        await AuthGroups.addUserToGroup(req.headers.authorization,
                            datagroup, userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

                    }

                }

            }



        } else {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Please use Delfi portal to add users to ' + tenant.name + ' tenant'));
        }
    }

    // remove a user from a tenant or a subproject
    private static async removeUser(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.AUTHORIZATION)) return {};

        // parse user request
        const userInput = UserParser.removeUser(req);
        const sdPath = userInput.sdPath;
        let userEmail = userInput.email;

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com.t
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected
        userEmail = Utils.checkSauthV1EmailDomainName(userEmail);

        // user cannot remove himself
        // DE allows this operation, why do we disallow?
        if ((await SeistoreFactory.build(
            Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, true)) === userEmail) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'A user cannot remove himself.'));
        }
        // retrieve the tenant informations
        const tenant = await TenantDAO.get(sdPath.tenant);

        // check authorizations
        if (sdPath.subproject) {

            const journalClient = JournalFactoryTenantClient.get(tenant);
            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, sdPath.subproject],
            });

            const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject, spkey);

            const adminGroups = subproject.acls.admins
            const viewerGroups = subproject.acls.viewers

            for (const group of adminGroups) {
                await this.doNotThrowIfNotMember(
                    AuthGroups.removeUserFromGroup(req.headers.authorization, group, userEmail,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]));
            }

            for (const group of viewerGroups) {
                await this.doNotThrowIfNotMember(
                    AuthGroups.removeUserFromGroup(req.headers.authorization, group, userEmail,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]));
            }


        } else {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Please use Delfi portal to remove users from ' + tenant.name + ' tenant'));
        }

    }

    // list users and their roles in a subproject
    private static async listUsers(req: expRequest): Promise<string[][]> {

        if (!FeatureFlags.isEnabled(Feature.AUTHORIZATION)) return [];

        // parse user request
        const sdPath = UserParser.listUsers(req);

        // retrieve the tenant informations
        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const spkey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.SUBPROJECTS_KIND, sdPath.subproject],
        });

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject, spkey);

        let users = []

        if (subproject.acls.admins.length > 0) {

            for (const adminGroup of subproject.acls.admins) {
                const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, adminGroup, tenant.esd,
                    req[Config.DE_FORWARD_APPKEY]))
                users = users.concat(result.map((el) => [el.email, 'admin']))
            }
        }

        if (subproject.acls.viewers.length > 0) {

            for (const viewerGroup of subproject.acls.viewers) {
                const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, viewerGroup, tenant.esd,
                    req[Config.DE_FORWARD_APPKEY]))
                users = users.concat(result.map((el) => [el.email, 'viewer']))
            }
        }

        return users
    }

    // retrieve the roles of a user
    private static async rolesUser(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.AUTHORIZATION)) return {};

        // parse user request
        const sdPath = UserParser.rolesUser(req);

        // retrieve the tenant informations
        const tenant = await TenantDAO.get(sdPath.tenant);

        // get the groups of the user
        const groups = await AuthGroups.getUserGroups(req.headers.authorization,
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        const prefix = sdPath.subproject ?
            SubprojectGroups.groupPrefix(sdPath.tenant, sdPath.subproject) :
            TenantGroups.groupPrefix(sdPath.tenant);


        const journalClient = JournalFactoryTenantClient.get(tenant);

        const registeredSubprojects = (await SubProjectDAO.list(journalClient, sdPath.tenant))
            .map(subproject => subproject.name)

        // build and return the user roles
        const basePath = Config.SDPATHPREFIX + sdPath.tenant + (sdPath.subproject ? ('/') + sdPath.subproject : '');

        return {
            roles: groups.filter((el) => el.name.startsWith(prefix))
                .map((el) => el.name.substr(prefix.length + 1))
                .filter((el) => {
                    const subproject = el.split('.')[0]
                    if (registeredSubprojects.includes(subproject)) {
                        return true
                    }
                    return false
                })
                .map((el) => {
                    const tokens = el.split('.'); return [
                        basePath + (tokens.length > 1) ? '/' + tokens[0] : '',
                        tokens[tokens.length - 1]];
                }),

        };
    }

    // do not throw if a user is not a member (fast remove users if not exist than check if exist and than remove it)
    private static async doNotThrowIfNotMember(methodToCall: any) {
        try {
            await methodToCall;
        } catch (error) {
            if (!(typeof error === 'object' &&
                typeof error.error === 'object' &&
                'message' in error.error &&
                (error.error.message as string).indexOf('Member not found'))) {
                throw (error);
            }
        }
    }

}
