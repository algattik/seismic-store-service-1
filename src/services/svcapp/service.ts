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
import { AppHandler } from './handler';
import { AppOp } from './optype';

const router = Router();

// register a new application
router.post('/', (req: expRequest, res: expResponse) => {
    AppHandler.handler(req, res, AppOp.Register);
});

// list the registered applications
router.get('/', (req: expRequest, res: expResponse) => {
    AppHandler.handler(req, res, AppOp.List);
});

// register a trusted application
router.post('/trusted', (req: expRequest, res: expResponse) => {
    AppHandler.handler(req, res, AppOp.RegisterTrusted);
});

// list the truested applications
router.get('/trusted', (req: expRequest, res: expResponse) => {
    AppHandler.handler(req, res, AppOp.ListTrusted);
});

export { router as SvcAppRouter };
