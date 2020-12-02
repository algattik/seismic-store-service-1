// ============================================================================
// Copyright 2017-2020, Schlumberger
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

import { Config } from '../cloud';
import { DESCompliance, DESUtils } from '../dataecosystem';
import { ImpTokenDAO } from '../services/imptoken';
import { AppsDAO } from '../services/svcapp/dao';
import { TenantModel } from '../services/tenant';
import { Error, Utils } from '../shared';
import { AuthGroups } from './groups';

export class Auth {

    public static async isUserRegistered(userToken: string, esd: string, appkey: string) {
        await AuthGroups.getUserGroups(userToken, esd, appkey);
    }

    public static async isUserAuthorized(
        authToken: string, authGroupsName: string[],
        esd: string, appkey: string, mustThrow = true): Promise<boolean> {
        const isAuthorized = await AuthGroups.hasOneInGroups(authToken, authGroupsName, esd, appkey);
        if (mustThrow && !isAuthorized) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'User not authorized to perform this operation'));
        }
        return isAuthorized;
    }

    public static async isWriteAuthorized(
        authToken: string, authGroupsName: string[],
        tenantName: string, subprojectName: string,
        esd: string, appkey: string, mustThrow: boolean = true): Promise<boolean> {

        if (Auth.isImpersonationToken(authToken)) {
            return Auth.isImpersonationTokenWriteAuthorized(authToken,
                tenantName, subprojectName, mustThrow);
        } else {
            return await Auth.isUserAuthorized(authToken, authGroupsName, esd, appkey, mustThrow);
        }
    }

    public static async isReadAuthorized(
        authToken: string, authGroupsName: string[],
        tenantName: string, subprojectName: string,
        esd: string, appkey: string, mustThrow: boolean = true): Promise<boolean> {

        if (Auth.isImpersonationToken(authToken)) {
            return Auth.isImpersonationTokenReadAuthorized(authToken,
                tenantName, subprojectName, mustThrow);
        } else {
            return await Auth.isUserAuthorized(authToken, authGroupsName, esd, appkey, mustThrow);
        }
    }

    public static async isAppAuthorized(
        tenant: TenantModel, email: string, mustThrow: boolean = true): Promise<boolean> {
        const application = await AppsDAO.get(tenant, email);
        if (mustThrow && (!application || !application.trusted)) {
            throw (Error.make(
                Error.Status.PERMISSION_DENIED,
                'Application not authorized to perform this operation'));
        }
        return application ? application.trusted : false;
    }

    public static async isLegalTagValid(
        userToken: string,ltag: string, esd: string, appkey: string, mustThrow: boolean = true): Promise<boolean> {
        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        const isValid = await DESCompliance.isLegaTagValid(userToken, ltag, entitlementTenant, appkey);
        if (mustThrow && !isValid) {
            throw (Error.make(
                Error.Status.NOT_FOUND, 'The legal tag \'' + ltag + '\' is not valid.'));
        }
        return isValid;
    }

    public static isImpersonationToken(authToken: string): boolean {
        return Utils.getIssFromPayload(authToken.split('.')[1]) === Config.IMP_SERVICE_ACCOUNT_SIGNER;
    }

    private static isImpersonationTokenWriteAuthorized(
        impToken: string, tenantName: string, subprojectName: string, mustThrow: boolean = true): boolean {
        const impTokenBody = ImpTokenDAO.getImpTokenBody(impToken);
        const resourceRef = tenantName + '/' + subprojectName;
        const resource = impTokenBody.resources.find((el) => el.resource === resourceRef);

        if (!resource && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        if (!resource) { return false; }

        if (resource.readonly && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been write authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        return !resource.readonly;
    }

    private static isImpersonationTokenReadAuthorized(
        impToken: string, tenantName: string, subprojectName: string, mustThrow: boolean = true): boolean {
        const impTokenBody = ImpTokenDAO.getImpTokenBody(impToken);
        const resourceRef = tenantName + '/' + subprojectName;
        const resource = impTokenBody.resources.find((el) => el.resource === resourceRef);

        if (!resource && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        return resource !== undefined;
    }

}
