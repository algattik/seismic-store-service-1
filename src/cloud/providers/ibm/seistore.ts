/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { SubProjectModel } from '../../../services/subproject';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';

@SeistoreFactory.register('ibm')
export class IbmSeistore extends AbstractSeistore {
    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) { return; }
}
