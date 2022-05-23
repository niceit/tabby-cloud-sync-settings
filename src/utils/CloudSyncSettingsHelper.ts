// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import AmazonData from '../data/s3-data'
import CloudSyncSettingsData from '../data/setting-items'

class CloudSyncSettingsHelper {
    getS3regionsList = (provider: string) => {
        switch (provider) {
            case CloudSyncSettingsData.values.WASABI: {
                return AmazonData.wasabi
            }

            case CloudSyncSettingsData.values.DIGITAL_OCEAN: {
                return AmazonData.DIGITAL_OCEAN
            }

            default: {
                return AmazonData.regions
            }
        }
    }
}

const cloudSyncSettingsHelper = new CloudSyncSettingsHelper()
export default cloudSyncSettingsHelper
