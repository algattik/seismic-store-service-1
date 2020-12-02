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

import { TenantModel } from '.';
import { AuthGroups } from '../../auth';

export class TenantGroups {

    public static groupPrefix(tenantName: string): string {
        return AuthGroups.seistoreServicePrefix() + '.' + tenantName;
    }

    public static adminGroupName(tenant: TenantModel): string {
        return tenant.default_acls ? tenant.default_acls.split('@')[0] : this.groupPrefix(tenant.name) + '.admin';
    }

    public static adminGroup(tenant: TenantModel): string {
        return tenant.default_acls || (this.adminGroupName(tenant) + '@' + tenant.esd);
    }

}
