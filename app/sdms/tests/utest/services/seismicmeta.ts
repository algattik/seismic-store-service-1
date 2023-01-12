// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import sinon from 'sinon';
import { SeismicMetaManager } from '../../../src/services/dataset/schema-manager';
import { SegyManager } from '../../../src/services/dataset/schema-manager/segy-v1-manager';
import { Utils } from '../../../src/shared/utils';
import { SchemaTransformModel } from '../../../src/services/dataset/model';
import { Tx } from '../utils';

export class TestSeismicmeta {

    private static sandbox: sinon.SinonSandbox;
    private static manager: SeismicMetaManager;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sandbox = sinon.createSandbox();
                this.manager = new SeismicMetaManager();
            });

            afterEach(() => { 
                this.sandbox.restore(); 
            });

            this.testregister();
            this.testgetDatasetSchemaKind();
            this.testgetDatasetSchemaName();
            this.testvalidate();

        });

    }

    private static testregister() {

        Tx.sectionInit('test register');

        Tx.testExp(async (done: any) => {
            this.manager.addSchemas();
            done();
        });

    }

    private static testgetDatasetSchemaKind() {

        Tx.sectionInit('test get Dataset Schema Kind');

        Tx.testExp(async (done: any) => {
            try {
                this.manager.getDatasetSchemaKind();
            } catch (e) {done();}
        });

    }

    private static testgetDatasetSchemaName() {

        Tx.sectionInit('test get Dataset Schema Name');

        Tx.testExp(async (done: any) => {
            try {
                this.manager.getDatasetSchemaName();
            } catch (e) {done();}
        });

    }
    
    private static testvalidate() {

        Tx.sectionInit('test get Dataset Schema Name');

        Tx.testExp(async (done: any) => { 
            try {
                this.manager.validate("input-a");
            } catch (e) {done();}
        });

    }
}

export class TestSegyManager {

    private static sandbox: sinon.SinonSandbox;
    private static manager: SegyManager ;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(() => {  
                this.sandbox = sinon.createSandbox();
                this.manager = new SegyManager ();
            });

            afterEach(() => { 
                this.sandbox.restore(); 
            });

            this.testaddSchemas();
            this.testapplySchemaTransforms();
            this.testvalidate();

        });

    }

    private static testaddSchemas() {

        Tx.sectionInit('test add Schemas');

        Tx.testExp(async (done: any) => {

            this.sandbox.stub(Utils, "resolveJsonRefs").resolves();
            // this.sandbox.stub(Utils, "resolveJsonRefs").resolves();
            this.manager.addSchemas();
            done();
        });

    }

    private static testapplySchemaTransforms() {

        Tx.sectionInit('test apply Schema Transforms');

        Tx.testExp(async (done: any) => {

            let myModel = {
                transformFuncID: "transformFuncID-a",
                data: "data-a",
                nextTransformFuncID: "nextTransformFuncID-a"
            } as SchemaTransformModel;

            this.sandbox.stub(SegyManager, "schemaTransformFuncMap").resolves();
            try {
                this.manager.applySchemaTransforms(myModel);
            } catch (e) {done();}
            
        });

    }

    private static testvalidate() {

        Tx.sectionInit('test validate');

        Tx.testExp(async (done: any) => {

            // let myModel = {
            //     transformFuncID: "transformFuncID-a",
            //     data: "data-a",
            //     nextTransformFuncID: "nextTransformFuncID-a"
            // } as SchemaTransformModel;

            this.sandbox.stub(SegyManager, "schemaTransformFuncMap").resolves();
            try { this.manager.validate("data");}
            catch (e) {done();}
           
        });

    }
}

