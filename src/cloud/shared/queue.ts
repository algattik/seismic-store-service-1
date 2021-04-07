import { JournalFactoryTenantClient, StorageFactory } from '..';
import { DatasetDAO, DatasetModel } from '../../services/dataset';
import { Locker } from '../../services/dataset/locker';
import { Config } from '../config';
import { LoggerFactory } from '../logger';

import Bull from 'bull';

export class StorageJobManager {

   public static copyJobsQueue: Bull.Queue

   public static setup(cacheParams: {ADDRESS: string, PORT: number, KEY?: string, DISABLE_TLS?: boolean}) {

      const redisx = {
         host: cacheParams.ADDRESS,
         port: cacheParams.PORT
      }

      if(cacheParams.KEY) {
         redisx['password'] = cacheParams.KEY;
         if(!cacheParams.DISABLE_TLS) {
            redisx['tls'] = { servername: cacheParams.ADDRESS };
         }
      }

      StorageJobManager.copyJobsQueue = new Bull('copyjobqueue', {
         redis: redisx,
         limiter: {
            max: 100,
            duration: 600000,
         }
      })

      // setup job processing callback
      // tslint:disable-next-line: no-floating-promises
      StorageJobManager.copyJobsQueue.process(50, (input) => {
         return StorageJobManager.copy(input)
      })

      // setup  handlers for job events
      StorageJobManager.setupEventHandlers()

   }

   private static setupEventHandlers() {

      StorageJobManager.copyJobsQueue.on('failed', (input) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(
            'Copy job failure event for dataset' + input.data.datasetFrom.name +
            ' to ' + input.data.datasetTo.name + ' emitted.')
      })

      StorageJobManager.copyJobsQueue.on('error', (error) => {
         LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
      })

   }

   public static async copy(input) {

      enum TransferStatus {
         Completed = 'Completed',
         Aborted = 'Aborted'
      }

      const LOCK_ACQUIRE_MAX_ATTEMPTS = 100

      let registeredDataset: DatasetModel;
      let registeredDatasetKey: any;
      const journalClient = JournalFactoryTenantClient.get(input.data.tenant);
      const datasetToPath = input.data.datasetTo.tenant + '/' +
         input.data.datasetTo.subproject + input.data.datasetTo.path + input.data.datasetTo.name;
      const datasetFromPath = input.data.datasetFrom.tenant + '/' +
         input.data.datasetFrom.subproject + input.data.datasetFrom.path + input.data.datasetTo.name;

      let cacheMutex: any;
      try {

         // try about 100 times to acquire mutex before failing the job
         try {
            for (let i = 0; i < LOCK_ACQUIRE_MAX_ATTEMPTS; i++) {
               cacheMutex = await Locker.acquireMutex(datasetToPath)

               if (cacheMutex) {
                  break
               }

            }
         } catch (err) {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(
               '[copy-transfer] Unable to acquire the lock for ' + datasetToPath + 'during copy job.')
            throw err
         }

         const results = await DatasetDAO.get(journalClient, input.data.datasetTo);
         registeredDataset = results[0]
         registeredDatasetKey = results[1]

         if (!registeredDataset) {
            throw new Error('Dataset ' + datasetToPath + 'is not registered, aborting copy')
         }

         const storage = StorageFactory.build(Config.CLOUDPROVIDER, input.data.tenant);

         LoggerFactory.build(Config.CLOUDPROVIDER).info(
            '[copy-transfer] starting copy operations to ' + datasetToPath)

         await storage.copy(input.data.sourceBucket, input.data.prefixFrom,
            input.data.destinationBucket, input.data.prefixTo, input.data.usermail);

         registeredDataset.transfer_status = TransferStatus.Completed

         await DatasetDAO.update(journalClient, registeredDataset, registeredDatasetKey)

         await Locker.releaseMutex(cacheMutex, datasetToPath)

         const lockKeyFrom = input.data.datasetFrom.tenant + '/' + input.data.datasetFrom.subproject +
            input.data.datasetFrom.path + input.data.datasetFrom.name;
         await Locker.unlock(lockKeyFrom, input.data.readlockId);

         const lockKeyTo = input.data.datasetTo.tenant + '/' + input.data.datasetTo.subproject +
            input.data.datasetTo.path + input.data.datasetTo.name;
         await Locker.unlock(lockKeyTo, input.data.datasetTo.sbit);

         LoggerFactory.build(Config.CLOUDPROVIDER).info(
            '[copy-transfer] completed copy operations to ' + datasetToPath)

      }
      catch (err) {

         if (cacheMutex) {
            await Locker.del(datasetToPath);
            await Locker.del(datasetFromPath);
            await Locker.releaseMutex(cacheMutex, datasetToPath);
         }

         // try to update the status to aborted if possible
         if (registeredDataset) {
            registeredDataset.transfer_status = TransferStatus.Aborted
            await DatasetDAO.update(journalClient, registeredDataset, registeredDatasetKey)
         }

         throw err
      }

   }
}


