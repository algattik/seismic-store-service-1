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

import { Config } from '../cloud';

export class Utils {

    public static getPropertyFromTokenPayload(base64jwtpayload: string, property: string): string {
        const payload = this.getPayloadFromStringToken(base64jwtpayload);
        return property in payload ? payload[property] : undefined;
    }


    // This method is temporary required by slb during the migration of sauth from v1 to v2
    // The method replace slb.com domain name with delfiserviceaccount.com.t
    // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
    // Others service domain won't be affected by this call
    public static checkSauthV1EmailDomainName(email: string): string {
        return Config.CLOUDPROVIDER === 'google' && email.endsWith('slbservice.com@slb.com') ?
            email.replace('slbservice.com@slb.com', 'slbservice.com@delfiserviceaccount.com') : email;
    }

    public static getIssFromPayload(base64jwtpayload: string): string {
        return this.getPayloadFromStringToken(base64jwtpayload).iss;
    }

    public static getExpTimeFromPayload(base64jwtpayload: string): number {
        return Number(this.getPayloadFromStringToken(base64jwtpayload).exp);
    }

    public static getAudienceFromPayload(base64jwtpayload: string): string {
        return this.getPayloadFromStringToken(base64jwtpayload).aud
    }

    public static makeID(len: number): string {
        let id = '';
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < len; i++) {
            id += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return id;
    }

    public static getPayloadFromStringToken(base64jwtpayload: string): any {

        if (base64jwtpayload === undefined) { return undefined; }

        base64jwtpayload = base64jwtpayload.replace(' ', '');
        base64jwtpayload = base64jwtpayload.replace('Bearer', '');
        const base64jwtpayloadtokens = base64jwtpayload.split('.');

        base64jwtpayload = base64jwtpayloadtokens.length === 3 ? base64jwtpayloadtokens[1] : base64jwtpayload;

        const missingPadding = base64jwtpayload.length % 4;
        if (missingPadding !== 0) {
            base64jwtpayload += '='.repeat(4 - missingPadding);
        }

        return JSON.parse(Buffer.from(base64jwtpayload, 'base64').toString());

    }

}
