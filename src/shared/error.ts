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

export class ErrorModel {
    public error: {
        code: number,
        message: string,
        status: string,
    };
}

export class Error {

    public static Status = {
        ALREADY_EXISTS: 409,
        BAD_REQUEST: 400,
        LOCKED: 423,
        NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        UNAUTHENTICATED: 401,
        UNKNOWN: 500,
        NOT_IMPLEMENTED: 501
    };

    public static make(errorCode: number, message: string, mexprefix: string = '[seismic-store-service]'): ErrorModel {
        return {
            error: {
                code: errorCode,
                message: mexprefix + ' ' + message,
                status: this.getKeyByValue(errorCode) || 'UNKNOWN',
            },
        };
    }

    public static makeForHTTPRequest(error: any, mexprefix: string = '[seismic-store-service]'): ErrorModel {
        if (typeof error === 'object' && error.name === 'StatusCodeError') {
            return this.make(
                error.statusCode || 500,
                typeof error.error === 'object' ? error.error.message || error.message : error.message || error,
                mexprefix);
        } else {
            return this.make(500, error, mexprefix);
        }
    }

    private static getKeyByValue(value: number) {
        return Object.keys(this.Status).find((key) => this.Status[key] === value);
    }

}