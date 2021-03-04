/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import { AbstractStorage, StorageFactory } from '../../storage';
import AWS from 'aws-sdk';
import { Config } from '../../config';
import { IbmConfig } from './config';
import { logger } from './logger';

let cosStorage;

@StorageFactory.register('ibm')
export class Cos extends AbstractStorage {

	private COS_SUBPROJECT_BUCKET_PREFIX = 'ss-' + Config.SERVICE_ENV;
	
    public constructor() {
        super();
        logger.info('In Cos.constructor. Instantiating cos client.');
        cosStorage  = new AWS.S3({
                accessKeyId: IbmConfig.COS_ACCESS_KEY_ID ,
                secretAccessKey: IbmConfig.COS_SECRET_ACCESS_KEY ,
                endpoint: IbmConfig.COS_ENDPOINT,
                s3ForcePathStyle: IbmConfig.COS_S3_FORCEPATHSTYLE, // needed with minio?
                signatureVersion: IbmConfig.COS_SIGNATUREVERSION
        });
    }

    

    //generate a random bucket name
    public randomBucketName(): string {
        logger.info('In Cos.randomBucketName.');
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        logger.info('Returning from Cos.randomBucketName. BucketName - ');
		logger.debug(this.COS_SUBPROJECT_BUCKET_PREFIX);
        logger.debug(suffix);
		return this.COS_SUBPROJECT_BUCKET_PREFIX + '-' + suffix;
    }

    //Create a new bucket
    public async createBucket(
        bucketName: string,
        location: string, storageClass: string): Promise<void> {
        logger.info('In Cos.createBucket.');
        logger.debug(bucketName);
        ///not sure how to use ACLs
        const bucketParams = {
            Bucket: bucketName,
            CreateBucketConfiguration: {
                // Set your region here
               // LocationConstraint: location
            }
        };

        cosStorage.createBucket(bucketParams, function(err, data) {
            if (err) {
                logger.error('Error while creating bucket. Error stack - ');
                logger.error(err.stack);
                throw err;
            }
            else
            {
                logger.info('Bucket created successfully @');
                logger.debug(data.Location);
            }
        });
        logger.info('Returning from Cos.createBucket.');
    }

    //Cos bucket deletion
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        logger.info('In Cos.deleteBucket.');
        logger.debug(bucketName);
        var params = {Bucket: bucketName};
        cosStorage.deleteBucket(params, function(err) {
            if (err) {
                logger.error('Unable to delete bucket. Error stack');
                logger.error(err.stack);
                throw err;
            }
            logger.info('Removed bucket.');
          })
        logger.info('Returning from Cos.deleteBucket.');
    }

    //Deletion of files in Cos bucket 
    public async deleteFiles(bucketName: string): Promise<void> {
        logger.info('In Cos.deleteFiles.');
        logger.debug(bucketName);
        var self = this;
        cosStorage.listObjects({Bucket: bucketName}, function (err, data) {
            if (err) {
                logger.error("error listing bucket objects ");
                logger.error(err.stack);
                throw err;
            }
            var items = data.Contents;

            if(!items || items.length<=0)
                logger.info('No items to delete.');
            else
                for (var i = 0; i < items.length; i += 1) {
                    var objectKey = items[i].Key;
                    logger.info('Object to be deleted. objectKey-');
                    logger.debug(objectKey);
                    self.deleteObject(bucketName, objectKey);
                }
        });
        logger.info('Returning from Cos.deleteFiles.');
    }

    //Saving file in Cos bucket
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        logger.info('In Cos.saveObject.');
        logger.debug(bucketName);
        logger.debug(objectName);
        logger.debug(data);
        let params = {Bucket: bucketName, Key: objectName, Body: data};

        cosStorage.putObject(params, function(err, data) {
            if (err) {
                logger.error('Object not saved.');
                logger.error(err.stack);
                throw err;
            }
            else
            {
                logger.info("Object saved.");
                logger.debug(data);
            }
        });
        logger.info('Returning from Cos.saveObject.');
    }

    //delete an object from a bucket
    public async deleteObject(bucketName: string, objectName: string): Promise<void> {
        ///used to delete CDO file
        logger.info('In Cos.deleteObject.');
        let params = {Bucket: bucketName, Key: objectName};
        cosStorage.deleteObject(params, function(err) {
            if (err) {
                logger.error('Unable to remove object');
                logger.error(err.stack);
                throw err;
            }
            logger.info('Removed the object')
        });
        logger.info('Returning from Cos.deleteObject.');
    }

    //delete multiple objects
    public async deleteObjects(bucketName: string, prefix: string, async: boolean = false): Promise<void> {
        logger.info('This function deletes bulk data uploaded by SDAPI/SDUTIL. Not implemented yet.');
        logger.debug(bucketName);
        logger.debug(prefix);
        logger.info('Returning from Cos.deleteObject.');
        await Promise.resolve();
    }

    //copy multiple objects (skip the dummy file)
    ///implemention aws sdk copyObject to copy dataset
    public async copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string): Promise<void> {
        logger.info('In Cos.copy.');
        logger.info('Arguments passed:bucketIn,prefixIn...');
        logger.debug(bucketIn);
        logger.debug(prefixIn);
        logger.debug(bucketOut);
        logger.debug(prefixOut);
        logger.debug(ownerEmail);

        var self = this;
        cosStorage.listObjects({Bucket: bucketIn}, function (err, data) {
            if (err) {
                logger.error("Error in listing objects.");
                logger.error(err.stack);
                throw err;
            }

            logger.info("Fetched objects.");
            logger.debug(data);
            var items = data.Contents;

            if(!items || items.length<=0)
                logger.info('No items to copy.');
            else
                for (var i = 0; i < items.length; i += 1) {
                    var objectKey = items[i].Key;
                    var prefix = items[i].Key.split('/')[0];
                    logger.info('Object to be copied.');
                    logger.debug(objectKey);
                }
        });
        logger.info('Returning from Cos.deleteObject.');
    }

    //check bucket exists or not
    public async bucketExists(bucketName: string): Promise<boolean> {
        //const result = await cosStorage.bucket(bucketName).exists();
        logger.info('In Cos.bucketExists.');
        const bucketParams = {
            Bucket: bucketName
        };
        try {
            const result = await cosStorage.headBucket(bucketParams).promise();
            logger.info('Bucket exists. Returning from Cos.bucketExists.');
            return true;
        }
        catch(err) {
            logger.error('Bucket does not exist.');
            logger.error(err.stack);
            if (err.statusCode === 404) {
                return false;
            }
            throw err;
        }
    }
}