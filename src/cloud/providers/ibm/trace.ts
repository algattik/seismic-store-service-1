/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { AbstractTrace, TraceFactory } from '../../trace';
import { logger } from './logger';
@TraceFactory.register('ibm')
export class IbmTrace extends AbstractTrace {

    // Tracer not implemented yet
    public start() {
        logger.info('in IbmTrace.start function. Not implemented. Returning..');
        return;
    }

}
