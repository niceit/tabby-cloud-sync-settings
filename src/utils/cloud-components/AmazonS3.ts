/**
 * Amazon S3 Component for all plugin's S3 actions
 * @date 29 July 2021
 * @plugin Tabby Cloud Sync Settings
 * @author Tran IT <tranit1209@gmail.com>
 * @licence MIT
 */
import { S3 } from 'aws-sdk'

class AmazonS3Class {
    private appId
    private appSecret
    private bucket
    private region
    private path

    private PERMISSIONS = {
        PUBLIC: 'public-read',
    }
    private TEST_FILE = {
        type: 'text/plain',
        name: 'test.txt',
        content: 'This is test file',
    }

    setConfig (appId, appSecret, bucket, region, path) {
        this.appId = appId
        this.appSecret = appSecret
        this.bucket = bucket
        this.region = region
        this.path = path === '/' ? '' : path
    }

    /**
     * Test the connection to Amazon S3 configurators
     *
     * @return Object
     * */
    testConnection = async () => {
        const amazonS3 = new S3(
            {
                accessKeyId: this.appId,
                secretAccessKey: this.appSecret,
                region: this.region,
            }
        )

        const params = {
            Bucket: this.bucket,
            Key: this.path + this.TEST_FILE.name,
            Body: this.TEST_FILE.content,
            ACL: this.PERMISSIONS.PUBLIC,
            ContentType: this.TEST_FILE.type,
        }
        let response: any = {}

        try {
            response = await amazonS3.upload(params, (err, data) => {
                if (err) {
                    return { code: 0, message: err.message }
                } else {
                    return { code: 1, data: data }
                }
            }).promise()
        } catch (e) {
            response = { code: 0, message: e.toString() }
        }

        return response
    }
}

export default new AmazonS3Class()
