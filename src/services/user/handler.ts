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

            const journalClient = JournalFactoryTenantClient.get(tenant);

            const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);

            const serviceGroupRegex = SubprojectGroups.serviceGroupNameRegExp(tenant.name, subproject.name);
            const subprojectAdminServiceGroups = subproject.acls.admins
                .filter((group) => group.match(serviceGroupRegex));
            const subprojectViewerServiceGroups = subproject.acls.viewers
                .filter((group) => group.match(serviceGroupRegex));
            const subprojectServiceGroups = subprojectAdminServiceGroups.concat(subprojectViewerServiceGroups);

            const dataGroupRegex = SubprojectGroups.dataGroupNameRegExp(tenant.name, subproject.name);
            const adminSubprojectDataGroups = subproject.acls.admins.filter((group) => group.match(dataGroupRegex));
            const viewerSuprojectDataGroups = subproject.acls.viewers.filter(group => group.match(dataGroupRegex));
            const subprojectDataGroups = adminSubprojectDataGroups.concat(viewerSuprojectDataGroups);

            if (subprojectServiceGroups.length > 0) {

                if (userGroupRole === AuthRoles.admin) {

                    // rm the user from the groups since the user can be OWNER or Member
                    for (const group of subprojectServiceGroups) {
                        await this.doNotThrowIfNotMember(
                            AuthGroups.removeUserFromGroup(
                                req.headers.authorization, group, userEmail,
                                tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                    }

                    // add the user as OWNER for all service groups
                    for (const group of subprojectServiceGroups) {
                        await AuthGroups.addUserToGroup(
                            req.headers.authorization, group, userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');
                    }

                } else if (userGroupRole === AuthRoles.editor) {

                    // add the user as member for all editor service groups
                    for (const group of subprojectServiceGroups) {
                        if (group.indexOf('.editor@') !== -1) {
                            await AuthGroups.addUserToGroup(
                                req.headers.authorization, group,
                                userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                        }
                    }

                } else if (userGroupRole === AuthRoles.viewer) {

                    // add the user as member for all viewer service groups
                    for (const group of subprojectServiceGroups) {
                        if (group.indexOf('.viewer@') !== -1) {
                            await AuthGroups.addUserToGroup(
                                req.headers.authorization, group,
                                userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                        }
                    }

                } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

            }

            if (subprojectDataGroups.length > 0) {

                if (userGroupRole !== AuthRoles.viewer) {

                    // rm the user from the groups since the user can be OWNER or Member
                    for (const datagroup of subprojectDataGroups) {
                        await this.doNotThrowIfNotMember(
                            AuthGroups.removeUserFromGroup(
                                req.headers.authorization, datagroup, userEmail,
                                tenant.esd, req[Config.DE_FORWARD_APPKEY]));
                    }

                    // add the user as OWNER for all service groups
                    for (const datagroup of subprojectDataGroups) {
                        await AuthGroups.addUserToGroup(
                            req.headers.authorization, datagroup, userEmail,
                            tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');
                    }

                } else {

                    // add user to viewer group
                    for (const datagroup of subprojectDataGroups) {
                        if (datagroup.indexOf('.viewer@') !== -1) {
                            await AuthGroups.addUserToGroup(
                                req.headers.authorization, datagroup, userEmail,
                                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                        }
                    }

                }


                for (const datagroup of subprojectDataGroups) {

                    if (userGroupRole !== AuthRoles.viewer) {

                        // First rm the user from the groups since the user can be exclus Owner or Member
                        await this.doNotThrowIfNotMember(
                            AuthGroups.removeUserFromGroup(
                                req.headers.authorization, datagroup, userEmail,
                                tenant.esd, req[Config.DE_FORWARD_APPKEY]));

                        // add user as owner
                        await AuthGroups.addUserToGroup(req.headers.authorization,
                            datagroup, userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY], 'OWNER');

                    } else {
                        if (datagroup.indexOf('.viewer@') !== -1) {
                            await AuthGroups.addUserToGroup(req.headers.authorization,
                                datagroup, userEmail, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                        }

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

            const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);

            const adminGroups = subproject.acls.admins;
            const viewerGroups = subproject.acls.viewers;

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

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);

        let users = [];

        if (subproject.acls.admins.length > 0) {

            for (const adminGroup of subproject.acls.admins) {
                const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, adminGroup, tenant.esd,
                    req[Config.DE_FORWARD_APPKEY]));
                users = users.concat(result.map((el) => [el.email, 'admin']));
            }
        }

        if (subproject.acls.viewers.length > 0) {

            for (const viewerGroup of subproject.acls.viewers) {
                const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, viewerGroup, tenant.esd,
                    req[Config.DE_FORWARD_APPKEY]));
                users = users.concat(result.map((el) => [el.email, 'viewer']));
            }
        }

        return users;
    }

    // retrieve the roles of a user
    private static async rolesUser(req: expRequest) {

        if (!FeatureFlags.isEnabled(Feature.AUTHORIZATION)) return {};

        // parse user request
        const sdPath = UserParser.rolesUser(req);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        // Check if user has read access
        await Auth.isUserRegistered(req.headers.authorization, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // get the groups of the user
        const groups = await AuthGroups.getUserGroups(req.headers.authorization,
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // List of all group emails in which the user is member or a owner
        const groupEmailsOfUser = groups.map(group => group.email);

        const prefix = sdPath.subproject ?
            SubprojectGroups.serviceGroupPrefix(sdPath.tenant, sdPath.subproject) :
            TenantGroups.serviceGroupPrefix(sdPath.tenant);


        const journalClient = JournalFactoryTenantClient.get(tenant);

        const registeredSubprojects = (await SubProjectDAO.list(journalClient, sdPath.tenant));

        // Concatenate all valid subproject admin groups
        const registeredSubprojectAdminGroups = registeredSubprojects.map(subproject => subproject.acls.admins).flat(1);
        const registeredSubprojectViewerGroups = registeredSubprojects.map(
            subproject => subproject.acls.viewers).flat(1);

        // Find intersection of admin groups of all registered subprojects and the user group emails
        const validAdminGroupsForUser = registeredSubprojectAdminGroups.filter(grp => groupEmailsOfUser.includes(grp));
        const validViewerGroupsForUser = registeredSubprojectViewerGroups.filter(
            grp => groupEmailsOfUser.includes(grp));

        let roles = [];
        for (const validAdminGroup of validAdminGroupsForUser) {
            if (validAdminGroup.startsWith('service')) {
                roles.push(['/' + validAdminGroup.split('.')[4], 'admin']);
                roles.push(['/' + validAdminGroup.split('.')[4], 'editor']);
            }
            else if (validAdminGroup.startsWith('data')) {
                roles.push(['/' + validAdminGroup.split('.')[3], 'admin']);
                roles.push(['/' + validAdminGroup.split('.')[3], 'editor']);
            }
        }

        for (const validViewerGroup of validViewerGroupsForUser) {
            if (validViewerGroup.startsWith('service')) {
                roles.push(['/' + validViewerGroup.split('.')[4], 'viewer']);
            }
            else if (validViewerGroup.startsWith('data')) {
                roles.push(['/' + validViewerGroup.split('.')[3], 'viewer']);
            }
        }

        // Remove duplicates from roles array where each element is array by itself
        const stringRolesArray = roles.map(role => JSON.stringify(role));
        const uniqueRolesStringArray = new Set(stringRolesArray);
        roles = Array.from(uniqueRolesStringArray, (ele) => JSON.parse(ele));

        if (sdPath.subproject) {
            const subprojectRoles = roles.filter((role) => role[0] === '/' + sdPath.subproject);
            return {
                'roles': subprojectRoles
            };
        }

        return {
            'roles': roles
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
