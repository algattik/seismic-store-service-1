// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import * as crypto from 'crypto';
import { Config } from '../cloud';


export class Utils {

    public static getPropertyFromTokenPayload(base64JwtPayload: string, property: string): string {
        const payload = this.getPayloadFromStringToken(base64JwtPayload);
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

    public static getIssFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).iss;
    }

    public static getExpTimeFromPayload(base64JwtPayload: string): number {
        return Number(this.getPayloadFromStringToken(base64JwtPayload).exp);
    }

    public static getAudienceFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).aud;
    }

    public static getSubFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).sub;
    }

    public static getSubIDFromPayload(base64JwtPayload: string): string {
        return this.getPayloadFromStringToken(base64JwtPayload).subid;
    }

    public static makeID(len: number): string {
        let id = '';
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < len; i++) {
            id += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return id;
    }

    public static getPayloadFromStringToken(base64JwtPayload: string): any {

        if (base64JwtPayload === undefined) { return undefined; }

        base64JwtPayload = base64JwtPayload.replace(' ', '');
        base64JwtPayload = base64JwtPayload.replace('Bearer', '');
        const base64JwtPayloadTokens = base64JwtPayload.split('.');

        base64JwtPayload = base64JwtPayloadTokens.length === 3 ? base64JwtPayloadTokens[1] : base64JwtPayload;

        const missingPadding = base64JwtPayload.length % 4;
        if (missingPadding !== 0) {
            base64JwtPayload += '='.repeat(4 - missingPadding);
        }

        return JSON.parse(Buffer.from(base64JwtPayload, 'base64').toString());

    }

    public static encrypt(text: string, key: string) {
        const iv = crypto.randomBytes(16);
        const keySign = crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(keySign), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return {
            encryptedText: encrypted.toString('hex'),
            encryptedTextIV: iv.toString('hex')
        };
    }

    public static decrypt(encryptedText: string, encryptedTextIV: string, key: string) {
        const keySign = crypto.createHash('sha256').update(String(key)).digest('base64').substr(0, 32);
        const ivNew = Buffer.from(encryptedTextIV, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keySign), ivNew);
        let decrypted = decipher.update(Buffer.from(encryptedText, 'hex'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

}
