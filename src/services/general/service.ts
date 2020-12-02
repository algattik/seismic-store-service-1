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
import { GeneralHandler } from './handler';
import { GeneralOP } from './optype';

const router = Router();

// get the service status response [jwt not required by esp]
router.get('/', (req: expRequest, res: expResponse) => {
    GeneralHandler.handler(req, res, GeneralOP.Status);
});

// get the service status response [jwt required by esp]
router.get('/access', (req: expRequest, res: expResponse) => {
    GeneralHandler.handler(req, res, GeneralOP.Access);
});

export { router as GeneralRouter };
