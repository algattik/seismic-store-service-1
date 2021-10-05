/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { AbstractTrace, TraceFactory } from '../../trace';
import { logger } from './logger';

// [TODO] all logger.info looks more DEBUG message should not be executed in production code
@TraceFactory.register('ibm')
export class IbmTrace extends AbstractTrace {

    // [TODO] this method should start a call tracer using CSP SDK
    public start() {
        logger.info('in IbmTrace.start function. Not implemented. Returning..');
        return;
    }

}
