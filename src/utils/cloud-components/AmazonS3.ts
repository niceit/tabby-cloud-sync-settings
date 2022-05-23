// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
/**
 * Amazon S3 Component for all plugin's S3 actions
 * @date 29 July 2021
 * @plugin Tabby Cloud Sync Settings
 * @author Tran IT <tranit1209@gmail.com>
 * @licence MIT
 */
import { Endpoint, S3 } from 'aws-sdk'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncSettingsData from '../../data/setting-items'
import * as yaml from 'js-yaml'
import CloudSyncLang from '../../data/lang'
import SettingsHelper from '../settings-helper'
import { AmazonParams } from '../../interface'
import Logger from '../../utils/Logger'
import path from 'path'
import fs from 'fs'
import moment from 'moment'

let isSyncingInProgress = false
class AmazonS3Class {
    private provider = CloudSyncSettingsData.values.S3
    private appId
    private appSecret
    private bucket
    private region
    private path

    private PERMISSIONS = {
        PRIVATE: 'private',
        PUBLIC: 'public-read',
    }
    private TEST_FILE = {
        type: 'text/plain',
        name: 'test.txt',
        content: 'This is test file',
    }

    setProvider (provider: string) {
        this.provider = provider
    }

    setConfig (appId, appSecret, bucket, region, inputPath) {
        this.appId = appId
        this.appSecret = appSecret
        this.bucket = bucket
        this.region = region
        this.path = inputPath === '/' ? '' : inputPath
    }

    /**
     * Test the connection to Amazon S3 configurators
     *
     * @return Object
     * */
    testConnection = async (platform: PlatformService, s3_params) => {
        const logger = new Logger(platform)
        const amazonS3 = this.createClient(s3_params, platform)

        const params = {
            Bucket: this.bucket,
            Key: this.path + this.TEST_FILE.name,
            Body: this.TEST_FILE.content,
            ACL: this.PERMISSIONS.PRIVATE,
            ContentType: this.TEST_FILE.type,
        }
        let response = null

        try {
            response = await amazonS3.upload(params, (err, data) => {
                if (err) {
                    console.log(err)
                    logger.log(CloudSyncLang.trans('log.error_test_connection') + ' #1 | Exception: ' + err.message, 'error')
                    return { code: 0, message: err.message }
                } else {
                    return { code: 1, data: data }
                }
            }).promise()
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' #2 | Exception: ' + e.toString(), 'error')
            response = { code: 0, message: e.toString() }
        }

        return response
    }

    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params: AmazonParams, firstInit = false) {
        const logger = new Logger(platform)
        const result = { result: false, message: '' }
        const client = this.createClient(params, platform)
        let remoteFile = ''
        let remoteSyncConfigUpdatedAt = null

        if (this.path === '') {
            remoteFile = CloudSyncSettingsData.cloudSettingsFilename.substr(1, CloudSyncSettingsData.cloudSettingsFilename.length)
        } else {
            remoteFile = this.path + CloudSyncSettingsData.cloudSettingsFilename
        }

        const uploadObjectParams = {
            Bucket: this.bucket,
            Key: remoteFile,
            Body: SettingsHelper.readTabbyConfigFile(platform, true, true),
            ACL: this.PERMISSIONS.PRIVATE,
            ContentType: 'application/json',
        }

        try {
            const objectParams = { Bucket: params.bucket, Key: remoteFile }
            await client.getObject(objectParams).promise().then(async (data: any) => {
                const content = data.Body.toString()
                if (data.LastModified) {
                    remoteSyncConfigUpdatedAt = moment(data.LastModified)
                }
                try {
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            // eslint-disable-next-line @typescript-eslint/await-thenable
                            await client.upload(uploadObjectParams)
                            result['result'] = true
                        } else {
                            if (SettingsHelper.verifyServerConfigIsValid(content)) {
                                await SettingsHelper.backupTabbyConfigFile(platform)
                                config.writeRaw(SettingsHelper.doDescryption(content))
                                result['result'] = true
                            } else {
                                result['result'] = false
                                result['message'] = CloudSyncLang.trans('common.errors.invalidServerConfig')
                            }
                        }
                    } else {
                        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
                        let localFileUpdatedAt = null
                        // eslint-disable-next-line @typescript-eslint/await-thenable,@typescript-eslint/no-confusing-void-expression
                        await fs.stat(filePath, (err, stats) => {
                            //Checking for errors
                            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                            if (err){
                                logger.log(err)
                            } else {
                                localFileUpdatedAt = moment(stats.mtime)
                                logger.log('Auto Sync Amazon AWS')
                                logger.log('Server Updated At ' + (remoteSyncConfigUpdatedAt ? remoteSyncConfigUpdatedAt.format('YYYY-MM-DD HH:mm:ss') : null))
                                logger.log('Local Updated At '+ localFileUpdatedAt.format('YYYY-MM-DD HH:mm:ss'))

                                if (remoteSyncConfigUpdatedAt && remoteSyncConfigUpdatedAt > localFileUpdatedAt) {
                                    logger.log('Sync direction: Cloud to local.')
                                    config.writeRaw(SettingsHelper.doDescryption(content))
                                } else {
                                    logger.log('Sync direction: Local To Cloud.')
                                    this.syncLocalSettingsToCloud(platform, toast)
                                }
                            }
                        })

                        result['result'] = true
                    }
                } catch (e) {
                    result['result'] = false
                    result['message'] = e.toString()
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    const copyObjectParams = {
                        CopySource: remoteFile,
                        Bucket: this.bucket,
                        Key: remoteFile + '_bk' + new Date().getTime(),
                    }
                    // eslint-disable-next-line @typescript-eslint/await-thenable
                    await client.copyObject(copyObjectParams)
                    await client.upload(uploadObjectParams).promise()
                    logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
                }
            })
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())
            try {
                await client.upload(uploadObjectParams).promise()
                result['result'] = true
            } catch (exception) {
                result['result'] = false
                result['message'] = exception.toString()
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
        const logger = new Logger(platform)
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            this.setProvider(savedConfigs.adapter)
            const params = savedConfigs.configs
            const client = this.createClient(params, platform)
            let remoteFile = ''
            if (this.path === '') {
                remoteFile = CloudSyncSettingsData.cloudSettingsFilename.substr(1, CloudSyncSettingsData.cloudSettingsFilename.length)
            } else {
                remoteFile = this.path + CloudSyncSettingsData.cloudSettingsFilename
            }

            let response: any = {}
            const uploadObjectParams = {
                Bucket: this.bucket,
                Key: remoteFile,
                Body: SettingsHelper.readTabbyConfigFile(platform, true, true),
                ACL: this.PERMISSIONS.PRIVATE,
                ContentType: 'application/json',
            }
            try {
                response = await client.upload(uploadObjectParams).promise()
            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                }
            }

            if (response) {
                logger.log(CloudSyncLang.trans('sync.sync_success'))
            }
            isSyncingInProgress = false
        }
    }

    private createClient (params: AmazonParams, platform: PlatformService) {
        this.setConfig(params.appId, params.appSecret, params.bucket, params.region, params.location)
        const logger = new Logger(platform)
        const s3Params = {
            accessKeyId: this.appId,
            secretAccessKey: this.appSecret,
            region: this.region,
        }
        switch (this.provider) {
            case CloudSyncSettingsData.values.WASABI: {
                logger.log('Fetch Wasabi instance', 'info')
                s3Params['endpoint'] = new Endpoint(CloudSyncSettingsData.amazonEndpoints.WASABI)
                break
            }

            case CloudSyncSettingsData.values.DIGITAL_OCEAN: {
                logger.log('Fetch Digital instance', 'info')
                delete s3Params.region
                s3Params['endpoint'] = new Endpoint(CloudSyncSettingsData.amazonEndpoints.DIGITAL_OCEAN.replace('{REGION}', this.region))
                break
            }

            case CloudSyncSettingsData.values.BLACKBLAZE: {
                logger.log('Fetch Blackblaze instance', 'info')
                delete s3Params.region
                s3Params['endpoint'] = new Endpoint(CloudSyncSettingsData.amazonEndpoints.BLACKBLAZE.replace('{REGION}', this.region))
                break
            }

            default: {
                logger.log('Fetch Amazon instance', 'info')
            }
        }

        logger.log(s3Params, 'info')
        return new S3(s3Params)
    }
}

export default new AmazonS3Class()
