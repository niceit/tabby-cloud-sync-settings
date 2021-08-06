import AmazonData from '../data/s3-data'

class CloudSyncSettingsHelper {
    getS3regionsList = () => {
        return AmazonData.regions
    }
}

const cloudSyncSettingsHelper = new CloudSyncSettingsHelper()
export default cloudSyncSettingsHelper
