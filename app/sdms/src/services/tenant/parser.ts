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

import { Request as expRequest } from 'express';
import { TenantModel } from '.';
import { AuthGroups } from '../../auth';
import { Config, DataEcosystemCoreFactory } from '../../cloud';
import { DESUtils } from '../../dataecosystem';
import { Error, Params } from '../../shared';

export class TenantParser {

    public static create(req: expRequest): TenantModel {

        // check if body exist and is not empty
        Params.checkBody(req.body);

        const tenant = {} as TenantModel;
        tenant.name = req.params.tenantid;
        tenant.esd = req.body.esd;
        tenant.gcpid = req.body.gcpid;
        tenant.default_acls = req.body.default_acls || AuthGroups.datalakeUserAdminGroupEmail(tenant.esd);

        // check user input params
        Params.checkString(tenant.esd, 'esd');
        Params.checkString(tenant.gcpid, 'gcpid');
        Params.checkString(tenant.default_acls, 'default_acls');

        // check if the tenant name should match the data partition id
        if(DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER).tenantNameAndDataPartitionIDShouldMatch() &&
            tenant.name !== DESUtils.getDataPartitionID(tenant.esd)) {
                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The tenant name must match the data partition ID \'' + DESUtils.getDataPartitionID(tenant.esd) + '\''));
            }
        return tenant;
    }

    public static dataPartition(req: expRequest): string {
        Params.checkString(req.query.datapartition, 'datapartition');
        return req.query.datapartition;
    }

}
