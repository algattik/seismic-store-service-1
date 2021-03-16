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

import { v4 as uuidv4 } from 'uuid';
import { Config } from '../../cloud';
import { TenantGroups } from '../tenant';



export class SubprojectGroups {

    public static groupPrefix(tenantName: string, subprojectName: string): string {
        return TenantGroups.groupPrefix(tenantName) + '.' + subprojectName;
    }

    public static serviceAdminGroupName(tenant: string, subproject: string): string {
        return this.groupPrefix(tenant, subproject) + '.admin';
    }

    public static serviceEditorGroupName(tenant: string, subproject: string): string {
        return this.groupPrefix(tenant, subproject) + '.editor';
    }

    public static serviceViewerGroupName(tenant: string, subproject: string): string {
        return this.groupPrefix(tenant, subproject) + '.viewer';
    }

    public static serviceAdminGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceAdminGroupName(tenant, subproject) + '@' + esd;
    }

    public static serviceEditorGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceEditorGroupName(tenant, subproject) + '@' + esd;
    }

    public static serviceViewerGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceViewerGroupName(tenant, subproject) + '@' + esd;
    }


    public static dataAdminGroup(tenant: string, subproject: string, esd: string): string {
        return Config.DATAGROUPS_PREFIX + '.' + tenant + '.' + subproject + '.' + uuidv4() + '.admin' + '@' + esd;
    }

    public static dataViewerGroup(tenant: string, subproject: string, esd: string): string {
        return Config.DATAGROUPS_PREFIX + '.' + tenant + '.' + subproject + '.' + uuidv4() + '.viewer' + '@' + esd;
    }

}
