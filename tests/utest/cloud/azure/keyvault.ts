import sinon from 'sinon';
import assert from 'assert';

import { Keyvault } from '../../../../src/cloud/providers/azure/keyvault';
import { AzureConfig } from '../../../../src/cloud/providers/azure/config';
import { Tx } from '../../utils';
import { KeyVaultSecret } from '@azure/keyvault-secrets';

const mockAIInstrumentationKey = 'mockAIInstrumentationKey';
const mockRedisKey = 'mockRedisKey';
const mockRedisHost= 'mockRedisHost';
const mockSpTenantID = 'mockSpTenantID';
const mockSpClientID = 'mockSpClientID';
const mockSpClientSecret = 'mockSpClientSecret';
const mockSpAppSourceID = 'mockSpAppSourceID';
const mockSauthProvider = 'mockSauthProvider';

const mockSecretClient = {
    getSecret:  (secretName: string) => {
        return new Promise<KeyVaultSecret>((resolve, _reject) => {
            if (secretName === Keyvault.AI_INSTRUMENTATION_KEY) {
                resolve({
                    value: mockAIInstrumentationKey,
                } as any)
            }
            if (secretName === Keyvault.REDIS_KEY) {
                resolve( {
                    value: mockRedisKey,
                } as any)
            }
            if (secretName === Keyvault.REDIS_HOST) {
                resolve( {
                    value: mockRedisHost,
                } as any)
            }
            if (secretName === Keyvault.SP_TENANT_ID) {
                resolve( {
                    value: mockSpTenantID,
                } as any)
            }
            if (secretName === Keyvault.SP_CLIENT_ID) {
                resolve( {
                    value: mockSpClientID,
                } as any)
            }
            if (secretName === Keyvault.SP_CLIENT_SECRET) {
                resolve( {
                    value: mockSpClientSecret,
                } as any)
            }
            if (secretName === Keyvault.SP_APP_RESOURCE_ID) {
                resolve( {
                    value: mockSpAppSourceID,
                } as any)
            }
            if (secretName === Keyvault.SERVICE_AUTH_PROVIDER_CREDENTIAL) {
                resolve( {
                    value: mockSauthProvider,
                } as any)
            }
        })
    },
} as any;

export class TestAzureKeyVault {
    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('azure keyvault test'), () => {
            this.sandbox = sinon.createSandbox();

            afterEach(() => {
                this.sandbox.restore();
            });

            this.TestGetSecrets();
        });
    }

    private static TestGetSecrets() {

        Tx.sectionInit('TestGetSecrets');
        Tx.test(async (done: any) => {
            await Keyvault.loadSecrets(mockSecretClient);
            assert.equal(AzureConfig.AI_INSTRUMENTATION_KEY, mockAIInstrumentationKey);
            assert.equal(AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY, mockRedisKey);
            assert.equal(AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS, mockRedisHost);
            assert.equal(AzureConfig.SP_TENANT_ID, mockSpTenantID);
            assert.equal(AzureConfig.SP_CLIENT_ID, mockSpClientID);
            assert.equal(AzureConfig.SP_CLIENT_SECRET, mockSpClientSecret);
            assert.equal(AzureConfig.SP_APP_RESOURCE_ID, mockSpAppSourceID);
            assert.equal(AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL, mockSauthProvider);

            done();
        });
    }

}
