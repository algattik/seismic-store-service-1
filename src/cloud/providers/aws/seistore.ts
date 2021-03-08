// Copyright © 2020 Amazon Web Services
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


import { SubProjectModel } from '../../../services/subproject';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';
import { Utils } from '../../../shared';
@SeistoreFactory.register('aws')
export class AwsSeistore extends AbstractSeistore {
    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) { return; }

    public async getEmailFromTokenPayload(
        userCredentials: string, internalSwapForSauth: boolean): Promise<string> { // swapSauthEmailClaimToV2=true
        const payload = Utils.getPayloadFromStringToken(userCredentials);
        const email = payload.username;
        return internalSwapForSauth ? Utils.checkSauthV1EmailDomainName(email) : email;
    }
}
