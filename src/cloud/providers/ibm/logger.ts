/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { getLogger } from 'log4js';
import { initParams } from 'request-promise';
import {AbstractLogger, LoggerFactory} from '../../logger';
import { IbmConfig } from './config';

// fetch logger and export
@LoggerFactory.register('ibm')
export class IbmLogger extends AbstractLogger {

	public info(data: any): void {
        logger.info(data); 
    }

    public debug(data: any): void {
        logger.debug(data); 
    }

    public error(data: any): void {
        logger.error(data);
    }
    
    public metric(key:string,data: any): void {
        logger.info("No Metric");
    }
}

export const logger = getLogger();

export function config()
{
    logger.level = IbmConfig.LOGGER_LEVEL;
}