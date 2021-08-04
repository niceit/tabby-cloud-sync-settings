import AmazonData from '../data/s3-data'

class CloudSyncSettingsHelper {
    getS3regionsList = () => {
        return AmazonData.regions
    }

    calcTimezoneDatetimeByOffset(d, offset) {
        const utc = d.getTime() + (d.getTimezoneOffset() * 60000)
        return new Date(utc + (3600000 * offset))
    }
}

const cloudSyncSettingsHelper = new CloudSyncSettingsHelper()
export default cloudSyncSettingsHelper
