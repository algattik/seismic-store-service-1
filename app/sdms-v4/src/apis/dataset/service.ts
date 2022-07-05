// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Error, Response as SDMSResponse } from '../../shared';
import { Router, Request as expRequest, Response as expResponse } from 'express';

import { DatasetHandler } from './handler';
import { Operation } from './operations';

const DatasetRouter = Router();

DatasetRouter.put('/v1', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.RegisterPatch);
});

DatasetRouter.get('/v1/list', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.ListDatasets);
});

DatasetRouter.get('/v1/record/:id', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.Get);
});

DatasetRouter.delete('/v1/record/:id', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.DeleteDataset);
});

DatasetRouter.get('/v1/record/:id/versions', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.GetAllVersionIDsOfDataset);
});

DatasetRouter.get('/v1/record/:id/version/:version', async (req: expRequest, res: expResponse) => {
    await DatasetHandler.handler(req, res, Operation.GetVersionedDataset);
});

DatasetRouter.get('/v1/reindex', (req: expRequest, res: expResponse) => {
    SDMSResponse.writeError(res, Error.make(Error.Status.NOT_IMPLEMENTED, 'method not implemented yet'));
});

export { DatasetRouter };
