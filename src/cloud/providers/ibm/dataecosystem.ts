/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { logger } from './logger';
import { IbmConfig } from './config';

@DataEcosystemCoreFactory.register('ibm')
export class IbmDataEcosystemServices extends AbstractDataEcosystemCore {

    public fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel {
        logger.info('in IbmDataEcosystemServices.fixGroupMembersResponse. Returning..');
        logger.debug(groupMembers);
        groupMembers = groupMembers.members;
        logger.debug(groupMembers);

        if (groupMembers && groupMembers.length === 0) {
            throw {
                error: {
                    message: 'NOT_FOUND'
                },
                statusCode: 404,
                name: 'StatusCodeError'
            }
        }

        if (groupMembers && groupMembers.length === 1) {
            return {
                members: [{
                    email: groupMembers[0].email,
                    role: 'OWNER'
                }],
                cursor: undefined
            } as IDESEntitlementGroupMembersModel;
        }

        const members = [];
        for (const member of groupMembers as any[]) {
            members.push({
                email: member.email,
                role: 'MEMBER'
            });
        }
        return {
            members,
            cursor: undefined
        } as IDESEntitlementGroupMembersModel;
    }

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        logger.info('in IbmDataEcosystemServices.getAuthorizationHeader. Returning..');
        return userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken;
    }

    public getComplianceBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getComplianceBaseUrlPath. Returning..');
        return IbmConfig.COMPLIANCE_CONTEXT_PATH;
    };

    public getDataPartitionIDRestHeaderName(): string {
        logger.info('in IbmDataEcosystemServices.getDataPartitionIDRestHeaderName. Returning..');
        return 'data-partition-id';
    }

    public getEntitlementBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getEntitlementBaseUrlPath. Returning..');
        return IbmConfig.ENTITLEMENT_CONTEXT_PATH;
    };

    public getStorageBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getStorageBaseUrlPath. Returning..');
        return IbmConfig.STORAGE_CONTEXT_PATH;
    };

    public getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string } | string[] {
        const userBody = {
            'email': userEmail,
            'role': role
        };
        logger.info('in IbmDataEcosystemServices.getUserAddBodyRequest. Returning..');
        return userBody;
    }

    public tenantNameAndDataPartitionIDShouldMatch() {
        logger.info('in IbmDataEcosystemServices.tenantNameAndDataPartitionIDShouldMatch. Returning..');
        return true;
    }

}