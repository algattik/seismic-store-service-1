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

            // Add user to the subproject group
            if (userGroupRole === AuthRoles.admin) {

                // First rm the user from the groups since the user can be exclus Owner or Member
                await this.doNotThrowIfNotMember(
                    AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldAdminGroup(
                        tenant.name, sdPath.subproject, tenant.esd), userEmail,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                await this.doNotThrowIfNotMember(
                    AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldEditorGroup(
                        tenant.name, sdPath.subproject, tenant.esd), userEmail,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                await this.doNotThrowIfNotMember(
                    AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldViewerGroup(
                        tenant.name, sdPath.subproject, tenant.esd), userEmail,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]));

                await AuthGroups.addUserToGroup(req.headers.authorization, SubprojectGroups.oldAdminGroup(tenant.name,
                    sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');
                await AuthGroups.addUserToGroup(req.headers.authorization, SubprojectGroups.oldEditorGroup(tenant.name,
                    sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');
                await AuthGroups.addUserToGroup(req.headers.authorization, SubprojectGroups.oldViewerGroup(tenant.name,
                    sdPath.subproject, tenant.esd), userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

            } else if (userGroupRole === AuthRoles.editor) {

                await AuthGroups.addUserToGroup(
                    req.headers.authorization, SubprojectGroups.oldEditorGroup(tenant.name, sdPath.subproject, tenant.esd),
                    userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            } else if (userGroupRole === AuthRoles.viewer) {

                await AuthGroups.addUserToGroup(
                    req.headers.authorization, SubprojectGroups.oldViewerGroup(tenant.name, sdPath.subproject, tenant.esd),
                    userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

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

            // remove user from the subproject groups
            // could this be done in parallel, via Promise?
            await this.doNotThrowIfNotMember(
                AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldAdminGroup(
                    tenant.name, sdPath.subproject, tenant.esd), userEmail,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]));
            await this.doNotThrowIfNotMember(
                AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldEditorGroup(
                    tenant.name, sdPath.subproject, tenant.esd), userEmail,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]));
            await this.doNotThrowIfNotMember(
                AuthGroups.removeUserFromGroup(req.headers.authorization, SubprojectGroups.oldViewerGroup(
                    tenant.name, sdPath.subproject, tenant.esd), userEmail,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]));

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

        // retrieve the users in the subproject groups
        // can be done in parallel via promise?
        const admins = await AuthGroups.listUsersInGroup(req.headers.authorization,
            SubprojectGroups.oldAdminGroup(tenant.name, sdPath.subproject, tenant.esd),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        const editors = await AuthGroups.listUsersInGroup(req.headers.authorization,
            SubprojectGroups.oldEditorGroup(tenant.name, sdPath.subproject, tenant.esd),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        const viewers = await AuthGroups.listUsersInGroup(req.headers.authorization,
            SubprojectGroups.oldViewerGroup(tenant.name, sdPath.subproject, tenant.esd),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        return admins.map((el) => [el.email, 'admin']).concat(
            editors.map((el) => [el.email, 'editor'])).concat(
                viewers.map((el) => [el.email, 'viewer']));

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
