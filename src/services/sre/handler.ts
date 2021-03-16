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
import { AuthGroups } from '../../auth';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { Error, Response } from '../../shared';
import { SubProjectDAO, SubprojectGroups } from '../subproject';
import { AppsDAO } from '../svcapp/dao';
import { TenantDAO, TenantGroups, TenantModel } from '../tenant';
import { SreOP } from './optype';

export class SreHandler {

    // handler for the [ /sre ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: SreOP) {

        try {

            if (op === SreOP.Maintenance) {
                Response.writeOK(res, await this.runMaintenance(req));
            } else if (op === SreOP.Diagnostic) {
                Response.writeOK(res, await this.runDiagnostic(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) { Response.writeError(res, error); }

    }

    // execute maintenance script
    private static async runMaintenance(req: expRequest): Promise<any> {

        const srex: string = req.query.srex;

        // the opid is required for run a maintenance script
        if (!srex) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The srex query parameter has not been provided.'));
        }

        throw (Error.make(Error.Status.BAD_REQUEST, 'Opeartion not supported.'));

    }

    // execute diagnostic script
    private static async runDiagnostic(req: expRequest): Promise<any> {

        const srex: string = req.query.srex;

        // the opid is required for run a maintenance script
        if (!srex) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The srex query parameter has not been provided.'));
        }

        if (srex === 'hFjSTbH6U3szSUOw') {
            return await this.runDiagnosticDES(req);
        } else {
            throw (Error.make(Error.Status.BAD_REQUEST, 'Opeartion not supported.'));
        }

    }

    private static async runDiagnosticDES(req: expRequest): Promise<any> {

        // [case 0] KwEK8v8EHqImnM7j: Report for all tenant
        // [case 1] KwEK8v8EHqImnM7j{tenant_name}: report for a specific tenant
        // [case 2] KwEK8v8EHqImnM7j{tenant_name}KLhxbtX1qfaJR4pr: report all subporject in a tenant
        // [case 3] KLhxbtX1qfaJR4pr{tenant_name}KLhxbtX1qfaJR4pr{subproject_name}:
        //          report for a specific subproject in a tenant

        let xcae: string = req.query.xcae;

        // the opid is required for run a maintenance script
        if (!xcae) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The xcae query parameter has not been provided.'));
        }

        let casex = 0;
        let tenantName: string;
        let subprojectName: string;
        if (xcae.startsWith('KwEK8v8EHqImnM7j')) {
            xcae = xcae.substr(16);
            if (xcae.length > 0) {
                if (xcae.indexOf('KLhxbtX1qfaJR4pr') !== -1) {
                    tenantName = xcae.split('KLhxbtX1qfaJR4pr')[0];
                    if (tenantName.length === 0) {
                        throw (Error.make(Error.Status.BAD_REQUEST, 'Opeartion not supported.'));
                    }
                    subprojectName = xcae.split('KLhxbtX1qfaJR4pr')[1];
                    casex = subprojectName.length === 0 ? 2 : 3;
                } else { casex = 1; tenantName = xcae; }
            } else { casex = 0; }
        } else { throw (Error.make(Error.Status.BAD_REQUEST, 'Opeartion not supported.')); }

        // [case 0] KwEK8v8EHqImnM7j: Report for all tenant
        if (casex === 0) {

            const tenants = await TenantDAO.getAll();
            const esds = tenants.map((e: TenantModel) => {
                return e.esd;
            }).filter((v, i, self) => {
                return self.indexOf(v) === i;
            });

            const groupmap: any[] = [];
            for (const esd of esds) {
                groupmap[esd] = await AuthGroups.getUserGroups(undefined, esd, req[Config.DE_FORWARD_APPKEY]);
            }

            const res = {};
            for (const tenant of tenants) {

                res[tenant.name] = {};
                res[tenant.name]['des-admin-group'] = tenant.default_acls ? 'custom-acl' :
                    groupmap[tenant.esd].map((group: any) => group.name).includes(
                        TenantGroups.adminGroupName(tenant)) ? true : false;
            }

            return res;

        }

        // [case 1] KwEK8v8EHqImnM7j{tenant_name}: report for a specific tenant
        if (casex === 1) {

            const tenant = await TenantDAO.get(tenantName);
            const groups = await AuthGroups.getUserGroups(undefined, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            const res = {};
            res[tenant.name] = {};
            res[tenant.name]['des-admin-group'] = tenant.default_acls ? 'custom-acl' :
                groups.map((group: any) => group.name).includes(
                    TenantGroups.adminGroupName(tenant)) ? true : false;

            if (req.query.exfe === '1TaZpRj8IAhG7xp9') {
                if (res[tenant.name]['des-admin-group']) {
                    if (!tenant.default_acls) {
                        res[tenant.name]['des-admin-members'] =
                            (await AuthGroups.listUsersInGroup(req.headers.authorization,
                                TenantGroups.adminGroup(tenant),
                                tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);
                    }
                }
                if (res[tenant.name]['des-app-group']) {
                    res[tenant.name]['des-app-members'] =
                        (await AppsDAO.list(tenant)).map((e) => e.email);
                }
                if (res[tenant.name]['des-apptrusted-group']) {
                    res[tenant.name]['des-apptrusted-members'] =
                        (await AppsDAO.list(tenant)).filter((e) => e.trusted).map((e) => e.email);
                }
            }

            return res;
        }

        // [case 2] KwEK8v8EHqImnM7j{tenant_name}KLhxbtX1qfaJR4pr: report all subporject in a tenant
        if (casex === 2) {

            const tenant = await TenantDAO.get(tenantName);
            const groups = await AuthGroups.getUserGroups(undefined, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            const journalClient = JournalFactoryTenantClient.get(tenant);
            const subprojects = await SubProjectDAO.getAll(journalClient, tenant.name);

            const res = {};
            for (const subproject of subprojects) {
                res[subproject.name] = {};

                res[subproject.name]['des-admin-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceAdminGroupName(tenant.name, subproject.name)) ? true : false;

                res[subproject.name]['des-editor-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceEditorGroupName(tenant.name, subproject.name)) ? true : false;

                res[subproject.name]['des-viewer-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceViewerGroupName(tenant.name, subproject.name)) ? true : false;

            }

            return res;

        }

        // [case 3] KLhxbtX1qfaJR4pr{tenant_name}KLhxbtX1qfaJR4pr{subproject_name}:
        //          report for a specific subproject in a tenant
        if (casex === 3) {

            const tenant = await TenantDAO.get(tenantName);
            const groups = await AuthGroups.getUserGroups(undefined, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            const journalClient = JournalFactoryTenantClient.get(tenant);
            const spkey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
                path: [Config.SUBPROJECTS_KIND, subprojectName],
            });
            const subproject = await SubProjectDAO.get(journalClient, tenant.name, subprojectName, spkey);

            const serviceGroupRegex = new RegExp('service.seistore.' + Config.SERVICE_ENV
                + '.' + subproject.tenant + '.' + subproject.name)

            const dataGroupRegex = new RegExp(Config.DATAGROUPS_PREFIX + '.' +
                subproject.tenant + '.' + subproject.name)

            const subprojectServiceGroups = subproject.acls.admins.filter((group) => group.match(serviceGroupRegex))


            const adminSubprojectDataGroups = subproject.acls.admins.filter((group) => group.match(dataGroupRegex))
            const viewerSuprojectDataGroups = subproject.acls.viewers.filter(group => group.match(dataGroupRegex))

            const subprojectDataGroups = adminSubprojectDataGroups.concat(viewerSuprojectDataGroups)


            const res = {};

            res[subproject.name] = {};


            if (subprojectServiceGroups.length > 0) {

                res[subproject.name]['des-admin-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceAdminGroupName(tenant.name, subproject.name)) ? true : false;

                res[subproject.name]['des-editor-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceEditorGroupName(tenant.name, subproject.name)) ? true : false;

                res[subproject.name]['des-viewer-group'] = groups.map(
                    (group: any) => group.name).includes(
                        SubprojectGroups.serviceViewerGroupName(tenant.name, subproject.name)) ? true : false;

                if (req.query.exfe === '1TaZpRj8IAhG7xp9') {
                    if (res[subproject.name]['des-admin-group']) {
                        res[subproject.name]['des-admin-members'] =
                            (await AuthGroups.listUsersInGroup(req.headers.authorization,
                                SubprojectGroups.serviceAdminGroup(tenant.name,
                                    subproject.name, tenant.esd),
                                tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);
                    }
                    if (res[subproject.name]['des-editor-group']) {
                        res[subproject.name]['des-editor-members'] =
                            (await AuthGroups.listUsersInGroup(req.headers.authorization,
                                SubprojectGroups.serviceEditorGroup(tenant.name,
                                    subproject.name, tenant.esd),
                                tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);
                    }
                    if (res[subproject.name]['des-viewer-group']) {
                        res[subproject.name]['des-viewer-members'] =
                            (await AuthGroups.listUsersInGroup(req.headers.authorization,
                                SubprojectGroups.serviceViewerGroup(tenant.name,
                                    subproject.name, tenant.esd),
                                tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);
                    }
                }

            }


            if (subprojectDataGroups.length > 0) {
                res[subproject.name]['des-admin-group'] = adminSubprojectDataGroups[0]

                res[subproject.name]['des-viewer-group'] = viewerSuprojectDataGroups[0]


                if (req.query.exfe === '1TaZpRj8IAhG7xp9') {

                    res[subproject.name]['des-admin-members'] =
                        (await AuthGroups.listUsersInGroup(req.headers.authorization,
                            adminSubprojectDataGroups[0],
                            tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);

                    res[subproject.name]['des-viewer-members'] =
                        (await AuthGroups.listUsersInGroup(req.headers.authorization,
                            viewerSuprojectDataGroups[0],
                            tenant.esd, req[Config.DE_FORWARD_APPKEY])).map((e) => e.email);

                }


            }

            return res;
        }

        throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));

    }

}
