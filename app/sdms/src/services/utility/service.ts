// ============================================================================
// Copyright 2017-2019, Schlumberger
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
// ============================================================================

import { Request as expRequest, Response as expResponse, Router } from 'express';
import { UtilityHandler } from './handler';
import { UtilityOP } from './optype';

const router = Router();

// list a path content
router.get('/ls', async (req: expRequest, res: expResponse) => {
    await UtilityHandler.handler(req, res, UtilityOP.LS);
});

// copy a dataset
router.post('/cp', async (req: expRequest, res: expResponse) => {
    await UtilityHandler.handler(req, res, UtilityOP.CP);
});

// get the gcs access token
router.get('/gcs-access-token', async (req: expRequest, res: expResponse) => {
    await UtilityHandler.handler(req, res, UtilityOP.GCSTOKEN);
});

export { router as UtilityRouter };
