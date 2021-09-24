import { Config } from '../cloud';

export enum Feature {
    AUTHORIZATION,
    LEGALTAG,
    SEISMICMETA_STORAGE,
    STORAGE_CREDENTIALS,
    IMPTOKEN,
    TRACE,
    LOGGING,
    STACKDRIVER_EXPORTER,
    CCM_INTERACTION
}

export class FeatureFlags {
    public static isEnabled(flag: Feature): boolean {
        return flag === Feature.AUTHORIZATION && Config.FEATURE_FLAG_AUTHORIZATION ||
            flag === Feature.LEGALTAG && Config.FEATURE_FLAG_LEGALTAG ||
            flag === Feature.SEISMICMETA_STORAGE && Config.FEATURE_FLAG_SEISMICMETA_STORAGE ||
            flag === Feature.STORAGE_CREDENTIALS && Config.FEATURE_FLAG_STORAGE_CREDENTIALS ||
            flag === Feature.IMPTOKEN && Config.FEATURE_FLAG_IMPTOKEN ||
            flag === Feature.TRACE && Config.FEATURE_FLAG_TRACE ||
            flag === Feature.LOGGING && Config.FEATURE_FLAG_LOGGING ||
            flag === Feature.STACKDRIVER_EXPORTER && Config.FEATURE_FLAG_STACKDRIVER_EXPORTER ||
            flag === Feature.CCM_INTERACTION && Config.FEATURE_FLAG_CCM_INTERACTION;

    }
}
