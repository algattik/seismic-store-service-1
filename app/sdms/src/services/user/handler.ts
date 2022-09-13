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
import { Auth, AuthGroups, AuthRoles, UserRoles } from '../../auth';
import { Config } from '../../cloud';
import { JournalFactoryTenantClient } from '../../cloud/journal';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { ISDPathModel } from '../../shared/sdpath';
import { DatasetDAO, DatasetModel } from '../dataset';
import { SubProjectDAO, SubprojectGroups, SubProjectModel } from '../subproject';
import { ISubProjectModel } from '../subproject/model';
import { TenantDAO, TenantGroups, TenantModel } from '../tenant';
import { ITenantModel } from '../tenant/model';
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

    private static async addUserToGroups(groups: string[], tenantEsd: string,
        userEmail: string, req: expRequest, role: UserRoles) {

        await Promise.all(groups.map(async group => {
            try {
                await AuthGroups.addUserToGroup(
                    req.headers.authorization, group, userEmail, tenantEsd,
                    req[Config.DE_FORWARD_APPKEY], role);
                return;
            } catch (e) {
                // If the error code is 400, retry adding the user as a member.
                // This would aid in adding a group email to the admin group.
                // Entitlements svc currently only allows one group to be added inside another
                // if the role is member
                if (e.error && e.error.code === 400) {
                    await AuthGroups.addUserToGroup(req.headers.authorization,
                        group, userEmail, tenantEsd, req[Config.DE_FORWARD_APPKEY], UserRoles.Member);
                } else if (e.error && e.error.code === 409) {
                    return; // If the user already exist -> return 200 (making the call idempotent)
                } else {
                    throw e;
                }
            }

        }));
    }


    private static async addUserAsAdmin(adminGroups: string[], viewerGroups: string[],
        tenant: TenantModel, req: expRequest, userEmail: string) {

        await this.addUserToGroups(adminGroups.concat(viewerGroups), tenant.esd, userEmail, req, UserRoles.Owner);

    }

    private static async addUserAsViewer(viewerGroups: string[], tenant: TenantModel,
        req: expRequest, userEmail: string) {

        await this.addUserToGroups(viewerGroups, tenant.esd, userEmail, req, UserRoles.Member);

    }

    // Add a user to a tenant or a subproject or a dataset
    private static async addUser(req: expRequest) {
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

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                `The specified SDMS URI is not a subproject or a dataset.
                    Users cannot be managed at the tenant level`));
        }

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);

        if (sdPath.dataset) {
            await UserHandler.addUserToDatasetGroups(subproject, sdPath, userGroupRole, req, tenant, userEmail);

        } else if (sdPath.subproject) {
            await UserHandler.addUserToSubprojectGroups(tenant, subproject, userGroupRole, req, userEmail);
        }

    }

    // ACLs at the level of dataset
    private static async addUserToDatasetGroups(subproject: ISubProjectModel,
        sdPath: ISDPathModel,
        userGroupRole: string, req, tenant: ITenantModel, userEmail: string) {


        if (subproject.access_policy !== Config.DATASET_ACCESS_POLICY) {
            throw Error.make(Error.Status.BAD_REQUEST, 'User cannot be added to the dataset ACLs as the subproject access policy is not set to dataset ');
        }

        const datasetModel: DatasetModel = {
            name: sdPath.dataset,
            subproject: sdPath.subproject,
            tenant: sdPath.tenant,
            path: sdPath.path
        } as DatasetModel;

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const datasetOUT = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetModel) :
            (await DatasetDAO.get(journalClient, datasetModel))[0];


        if (userGroupRole === AuthRoles.admin || userGroupRole === AuthRoles.editor) {
            if (datasetOUT.acls && 'admins' in datasetOUT.acls) {
                await this.addUserAsAdmin(datasetOUT.acls.admins, datasetOUT.acls.viewers,
                    tenant, req, userEmail);
            } else {
                throw Error.make(Error.Status.BAD_REQUEST, 'Dataset has no ACLs so the user cannot be added.');
            }
        } else if (userGroupRole === AuthRoles.viewer) {
            if (datasetOUT.acls && 'viewers' in datasetOUT.acls) {
                await this.addUserAsViewer(datasetOUT.acls.viewers, tenant, req, userEmail);

            } else {
                throw Error.make(Error.Status.BAD_REQUEST, 'Dataset has no ACLs so the user cannot be added.');
            }

        }
    }


    // ACLs at the level of subproject
    private static async addUserToSubprojectGroups(tenant: ITenantModel, subproject: ISubProjectModel,
        userGroupRole: string, req, userEmail: string, skipPolicyCheck = false) {

        const serviceGroupRegex = SubprojectGroups.serviceGroupNameRegExp(tenant.name, subproject.name);
        const subprojectAdminServiceGroups = subproject.acls.admins
            .filter((group) => group.match(serviceGroupRegex));
        const subprojectViewerServiceGroups = subproject.acls.viewers
            .filter((group) => group.match(serviceGroupRegex));

        const dataGroupRegex = SubprojectGroups.dataGroupNameRegExp(tenant.name, subproject.name);
        const adminSubprojectDataGroups = subproject.acls.admins.filter((group) => group.match(dataGroupRegex));
        const viewerSuprojectDataGroups = subproject.acls.viewers.filter(group => group.match(dataGroupRegex));


        const adminGroups = subprojectAdminServiceGroups.concat(adminSubprojectDataGroups);
        const viewerGroups = subprojectViewerServiceGroups.concat(viewerSuprojectDataGroups);



        if (userGroupRole === AuthRoles.admin || userGroupRole === AuthRoles.editor) {
            await this.addUserAsAdmin(adminGroups, viewerGroups, tenant, req, userEmail);
        }

        if (userGroupRole === AuthRoles.viewer) {
            await this.addUserAsViewer(viewerGroups, tenant, req, userEmail);
        }

    }

    // Remove a user from a tenant or a subproject or a dataset
    private static async removeUser(req: expRequest) {

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
        if (Utils.getPropertyFromTokenPayload(req.headers.authorization,
            Config.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC) === userEmail) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'A user cannot remove himself.'));
        }
        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);


        if (sdPath.dataset) {
            const datasetModel: DatasetModel = {
                name: sdPath.dataset,
                subproject: sdPath.subproject,
                tenant: sdPath.tenant,
                path: sdPath.path
            } as DatasetModel;

            const datasetOUT = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetModel) :
                (await DatasetDAO.get(journalClient, datasetModel))[0];

            if (datasetOUT.acls) {

                const result = await UserHandler.listUsersInAuthGroups(datasetOUT.acls.admins, datasetOUT.acls.viewers,
                    req, tenant);

                await UserHandler.findAndRemoveUser(result, userEmail, datasetOUT, tenant, req);
            }


        } else if (sdPath.subproject) {

            const result = await UserHandler.listUsersInAuthGroups(subproject.acls.admins, subproject.acls.viewers,
                req, tenant);

            await UserHandler.findAndRemoveUser(result, userEmail, subproject, tenant, req);

        } else {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Please use Delfi portal to remove users from ' + tenant.name + ' tenant'));
        }

    }

    private static async findAndRemoveUser(userListInAuthGroups: any[], userEmail: string,
        datastoreEntity: DatasetModel | SubProjectModel, tenant: TenantModel, req) {
        const admins = new Set();
        const viewers = new Set();

        userListInAuthGroups.map(lst => {
            for (const ele of lst) {
                if (ele === 'admin' || ele === 'editor') {
                    admins.add(lst[0]);
                } else {
                    viewers.add(lst[0]);
                }

            }

        });

        if (admins.has(userEmail)) {
            await UserHandler.removeUserFromAuthGroups(datastoreEntity.acls.admins,
                datastoreEntity.acls.viewers, tenant, req, userEmail);

        } else if (viewers.has(userEmail)) {
            await UserHandler.removeUserFromAuthGroups([],
                datastoreEntity.acls.viewers, tenant, req, userEmail);

        }
        return;
    }

    private static async removeUserFromAuthGroups(adminGroups: string[], viewerGroups: string[],
        tenant: ITenantModel, req, userEmail: string,
    ) {
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
    }

    // list users and their roles in a subproject
    private static async listUsers(req: expRequest): Promise<string[][]> {

        // parse user request
        const sdPath = UserParser.listUsers(req);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const subproject = await SubProjectDAO.get(journalClient, tenant.name, sdPath.subproject);



        if (sdPath.dataset) {

            const datasetModel: DatasetModel = {
                name: sdPath.dataset,
                subproject: sdPath.subproject,
                tenant: sdPath.tenant,
                path: sdPath.path
            } as DatasetModel;

            const datasetOUT = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetModel) :
                (await DatasetDAO.get(journalClient, datasetModel))[0];

            if (datasetOUT.acls) {
                return await UserHandler.listUsersInAuthGroups(datasetOUT.acls.admins, datasetOUT.acls.viewers,
                    req, tenant);
            }


        } else if (sdPath.subproject) {
            return await UserHandler.listUsersInAuthGroups(subproject.acls.admins,
                subproject.acls.viewers, req, tenant);

        }
        return;
    }

    private static async listUsersInAuthGroups(admins: string[], viewers: string[], req, tenant: ITenantModel,) {

        let users = [];


        for (const adminGroup of admins) {
            const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, adminGroup, tenant.esd,
                req[Config.DE_FORWARD_APPKEY]));
            users = users.concat(result.map((el) => [el.email, 'admin']));
        }


        for (const viewerGroup of viewers) {
            const result = (await AuthGroups.listUsersInGroup(req.headers.authorization, viewerGroup, tenant.esd,
                req[Config.DE_FORWARD_APPKEY]));
            users = users.concat(result.map((el) => [el.email, 'viewer']));
        }

        return users;
    }

    // retrieve the roles of a user
    private static async rolesUser(req: expRequest) {

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

        if (sdPath.dataset) {

            const subproject = await SubProjectDAO.get(journalClient, sdPath.tenant, sdPath.subproject);

            const datasetModel = {
                name: sdPath.dataset,
                tenant: sdPath.tenant,
                subproject: sdPath.subproject,
                path: sdPath.path
            } as DatasetModel;

            const datasetOUT = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetModel) :
                (await DatasetDAO.get(journalClient, datasetModel))[0];

            const roles = [];

            if (datasetOUT.acls) {
                const validAdminGroupsForUser = datasetOUT.acls.admins.filter(grp => groupEmailsOfUser.includes(grp));
                const validViewerGroupsForUser = datasetOUT.acls.viewers.filter(grp => groupEmailsOfUser.includes(grp));

                if (validAdminGroupsForUser.length > 0) {
                    roles.push('/' + sdPath.dataset, 'admin');
                }

                if (validViewerGroupsForUser.length > 0) {
                    roles.push('/' + sdPath.dataset, 'viewer');
                }
            }
            return {
                'roles': roles
            };

        } else if (sdPath.tenant) { // list subprojects roles

            // find all subprojects in which the users is at least member of an ACL group
            let roles = [];
            const subprojects = (await SubProjectDAO.list(journalClient, sdPath.tenant));
            for(const subproject of subprojects) {
                for(const admin of subproject.acls?.admins) {
                    if (groupEmailsOfUser.includes(admin)) {
                        roles.push(['/' + subproject.name, 'admin']);
                        break;
                    }
                }
                for(const viewer of subproject.acls?.viewers) {
                    if (groupEmailsOfUser.includes(viewer)) {
                        roles.push(['/' + subproject.name, 'viewer']);
                        break;
                    }
                }
            }

            if (sdPath.subproject) {
                roles = roles.filter((role) => role[0] === '/' + sdPath.subproject);
            }

            return {
                'roles': roles
            };

        }

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
