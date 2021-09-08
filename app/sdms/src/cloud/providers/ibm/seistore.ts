/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { SubProjectModel } from '../../../services/subproject';
import { Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';

@SeistoreFactory.register('ibm')
export class IbmSeistore extends AbstractSeistore {

    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) { return; }

    public async getEmailFromTokenPayload(
        userCredentials: string, internalSwapForSauth: boolean): Promise<string> { // swapSauthEmailClaimToV2=true
        const payload = Utils.getPayloadFromStringToken(userCredentials);
        const email = payload.email === Config.IMP_SERVICE_ACCOUNT_SIGNER ? payload.obo : payload.email;
        return internalSwapForSauth ? Utils.checkSauthV1EmailDomainName(email) : email;
    }

    public async notifySubprojectCreationStatus(
        subproject: SubProjectModel, status: string): Promise<string> {
        return 'Not Implemented';
    }

}
