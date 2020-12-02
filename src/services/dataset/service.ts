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
import { DatasetHandler } from './handler';
import { DatasetOP } from './optype';

const router = Router();

// register a new dataset
router.post('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Register);
    });

// get a dataset
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Get);
    });

// list all datasets in a subporject
router.get('/tenant/:tenantid/subproject/:subprojectid',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.List);
    });

// delete a dataset
router.delete('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Delete);
    });

// patch a Dataset
router.patch('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Patch);
    });

// Lock a Dataset for opening
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/lock',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Lock);
    });

// UnLock a Dataset
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/unlock',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.UnLock);
    });

// check if a list of datasets exist in a subproject
router.post('/tenant/:tenantid/subproject/:subprojectid/exist',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Exists);
    });

// retrieve the dataset size for a list of datasets
router.post('/tenant/:tenantid/subproject/:subprojectid/sizes',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Sizes);
    });

// check the permissions of a user on a dataset
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/permission',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.Permission);
    });

// check the dataset ctag
router.get('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/ctagcheck',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.CheckCTag);
    });

// list a path content
router.get('/tenant/:tenantid/subproject/:subprojectid/readdsdirfulllist',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.ListContent);
    });

// insert tags for a existing dataset
router.put('/tenant/:tenantid/subproject/:subprojectid/dataset/:datasetid/gtags',
    (req: expRequest, res: expResponse) => {
        DatasetHandler.handler(req, res, DatasetOP.PutTags);
    });

export { router as DatasetRouter };
