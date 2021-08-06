/**
 * Amazon S3 Component for all plugin's S3 actions
 * @date 29 July 2021
 * @plugin Tabby Cloud Sync Settings
 * @author Tran IT <tranit1209@gmail.com>
 * @licence MIT
 */
import { S3 } from 'aws-sdk'
import {ConfigService, PlatformService} from "terminus-core";
import {ToastrService} from "ngx-toastr";
import CloudSyncSettingsData from "../../data/setting-items";
import * as yaml from "js-yaml";
import CloudSyncLang from "../../data/lang";
import SettingsHelper from "../settings-helper";
import {AmazonParams} from "../../interface";

let isSyncingInProgress = false
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

    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params: AmazonParams, firstInit = false) {
        let result = false
        const client = this.createClient(params)
        let remoteFile
        if (this.path === '') {
            remoteFile = CloudSyncSettingsData.cloudSettingsFilename.substr(1, CloudSyncSettingsData.cloudSettingsFilename.length)
        } else {
            remoteFile = this.path + CloudSyncSettingsData.cloudSettingsFilename
        }

        const uploadObjectParams = {
            Bucket: this.bucket,
            Key: remoteFile,
            Body: SettingsHelper.readTabbyConfigFile(platform, true),
            ACL: this.PERMISSIONS.PUBLIC,
            ContentType: 'application/json',
        }

        try {
            const objectParams = { Bucket: params.bucket, Key: remoteFile }
            await client.getObject(objectParams).promise().then(async (data) => {
                const content = data.Body.toString()
                try {
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            await client.upload(uploadObjectParams)
                        } else {
                            config.writeRaw(content)
                        }
                    } else {
                        config.writeRaw(content)
                    }
                } catch (_) {
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    const copyObjectParams = {
                        CopySource: remoteFile,
                        Bucket: this.bucket,
                        Key: remoteFile + '_bk' + new Date().getTime()
                    }
                    await client.copyObject(copyObjectParams)
                    await client.upload(uploadObjectParams).promise()
                }
                result = true
            })
        } catch (_) {
            console.log(uploadObjectParams)
            try {
                await client.upload(uploadObjectParams).promise()
                result = true
            } catch (e) {
                console.log(e)
            }
        }

        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs
            const client = this.createClient(params)
            let remoteFile
            if (this.path === '') {
                remoteFile = CloudSyncSettingsData.cloudSettingsFilename.substr(1, CloudSyncSettingsData.cloudSettingsFilename.length)
            } else {
                remoteFile = this.path + CloudSyncSettingsData.cloudSettingsFilename
            }

            let response: any = {}
            const uploadObjectParams = {
                Bucket: this.bucket,
                Key: remoteFile,
                Body: SettingsHelper.readTabbyConfigFile(platform, true),
                ACL: this.PERMISSIONS.PUBLIC,
                ContentType: 'application/json',
            }
            try {
                response = await client.upload(uploadObjectParams).promise()
            } catch (_) {
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                }
            }

            if (response) {
                toast.info(CloudSyncLang.trans('sync.sync_success'))
            }
            isSyncingInProgress = false
        }
    }

    private createClient (params: AmazonParams) {
        this.setConfig(params.appId, params.appSecret, params.bucket, params.region, params.location)
        return new S3(
            {
                accessKeyId: this.appId,
                secretAccessKey: this.appSecret,
                region: this.region,
            }
        )
    }
}

export default new AmazonS3Class()
