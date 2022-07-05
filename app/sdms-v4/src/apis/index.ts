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

import { Config } from '../cloud';
import { ConnectionStringRouter } from './connection';
import { DatasetRouter } from './dataset';
import { Router } from 'express';
import { StatusRouter } from './status';

const router = Router();

router.use(Config.APIS_BASE_PATH + '/status', StatusRouter);
router.use(Config.APIS_BASE_PATH + '/generic', DatasetRouter);
router.use(Config.APIS_BASE_PATH + '/segy', DatasetRouter);
router.use(Config.APIS_BASE_PATH + '/connection-string', ConnectionStringRouter);

export { router as ServiceRouter };
