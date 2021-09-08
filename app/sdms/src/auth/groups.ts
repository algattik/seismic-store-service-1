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

import { IDESEntitlementGroupModel, IDESEntitlementMemberModel } from '../cloud/dataecosystem';
import { DESEntitlement, DESUtils } from '../dataecosystem';


export class AuthGroups {

    public static datalakeUserAdminGroupEmail(esd: string): string {
        return AuthGroups.datalakeUserAdminGroupName() + '@' + esd;
    }

    public static datalakeUserAdminGroupName(): string {
        return 'users.datalake.admins';
    }

    public static async createGroup(
        userToken: string, groupName: string, groupDescription: string, esd: string, appkey: string) {
        await DESEntitlement.createGroup(userToken, groupName,
            groupDescription, DESUtils.getDataPartitionID(esd), appkey);
    }

    public static async deleteGroup(userToken: string, groupEmail: string, esd: string, appkey: string) {
        const dataPartition = DESUtils.getDataPartitionID(esd);
        await DESEntitlement.deleteGroup(userToken, groupEmail, dataPartition, appkey);
    }

    public static async addUserToGroup(
        userToken: string, group: string, userEmail: string,
        esd: string, appkey: string, role = 'MEMBER', checkConsistencyForCreateGroup = false) {
        await DESEntitlement.addUserToGroup(userToken, group, DESUtils.getDataPartitionID(esd), userEmail,
            role, appkey, checkConsistencyForCreateGroup);
    }

    public static async removeUserFromGroup(
        userToken: string, group: string, userEmail: string, esd: string, appkey: string) {
        await DESEntitlement.removeUserFromGroup(userToken, group, DESUtils.getDataPartitionID(esd),
            userEmail, appkey);
    }

    public static async listUsersInGroup(userToken: string, group: string, esd: string, appkey: string):
        Promise<IDESEntitlementMemberModel[]> {
        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        return (await DESEntitlement.listUsersInGroup(userToken, group, entitlementTenant, appkey)).members;
    }

    public static async getUserGroups(
        userToken: string, esd: string, appkey: string): Promise<IDESEntitlementGroupModel[]> {
        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        return await DESEntitlement.getUserGroups(userToken, entitlementTenant, appkey);
    }

    public static async isMemberOfAtleastOneGroup(
        userToken: string, groupEmails: string[], esd: string, appkey: string): Promise<boolean> {
        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        const groups = await DESEntitlement.getUserGroups(userToken, entitlementTenant, appkey);
        return groupEmails.some((groupEmail) => (groups.map((group) => group.email)).includes(groupEmail));
    }

    public static async isMemberOfaGroup(
        userToken: string, memberEmail: string, group: string, esd: string, appkey, cursor?: string): Promise<boolean> {

        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        const groupMember = await DESEntitlement.listUsersInGroup(userToken, group, entitlementTenant, appkey);

        for (const member of groupMember.members) {
            if (member.email === memberEmail) { return true; }
        }

        if (!groupMember.nextCursor || groupMember.nextCursor.length === 0) { return false; }

        return await this.isMemberOfaGroup(memberEmail, group, esd, appkey, groupMember.nextCursor);

    }

}
