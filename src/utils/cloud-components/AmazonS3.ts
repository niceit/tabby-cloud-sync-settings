/**
 * Amazon S3 Component for all plugin's S3 actions
 * @date 29 July 2021
 * @plugin Tabby Cloud Sync Settings
 * @author Tran IT <tranit1209@gmail.com>
 * @licence MIT
 */
import { Endpoint, S3 } from 'aws-sdk'
import { ConfigService, PlatformService } from 'terminus-core'
import PluginToast from '../../services/toast'
import CloudSyncSettingsData from '../../data/setting-items'
import * as yaml from 'js-yaml'
import CloudSyncLang from '../../data/lang'
import SettingsHelper from '../settings-helper'
import { AmazonParams, SyncResult } from '../../interface'
import Logger from '../../utils/Logger'
import moment from 'moment'
import { applyRemoteConfigOnFirstInit, isRemoteMissingError, recordLocalBaselineOnFirstInit, resolveSyncDirection } from './sync-utils'

/** Connection details resolved from {@link AmazonParams} for a single call. */
interface ResolvedS3Config {
    appId: string,
    appSecret: string,
    bucket: string,
    region: string,
    path: string,
}

class AmazonS3Class {
    private provider = CloudSyncSettingsData.values.S3

    private PERMISSIONS = {
        PRIVATE: 'private',
        PUBLIC: 'public-read',
    }

    private TEST_FILE = {
        type: 'text/plain',
        name: 'test.txt',
        content: 'This is test file',
    }

    /** Select which S3-compatible provider subsequent calls should target. */
    setProvider (provider: string): void {
        this.provider = provider
    }

    /** Normalise the raw form params into a per-call config object. */
    private resolveConfig (params: AmazonParams): ResolvedS3Config {
        return {
            appId: params.appId,
            appSecret: params.appSecret,
            bucket: params.bucket,
            region: params.region,
            path: params.location === '/' ? '' : params.location,
        }
    }

    /** Compute the remote object key for the encrypted config file. */
    private getRemoteFileKey (resolved: ResolvedS3Config): string {
        if (resolved.path === '') {
            return CloudSyncSettingsData.cloudSettingsFilename.substr(1)
        }

        return resolved.path + CloudSyncSettingsData.cloudSettingsFilename
    }

    /**
     * Verify the S3 credentials by uploading a small test file.
     *
     * @return `{ code: 1 }` on success or `{ code: 0, message }` on failure.
     */
    testConnection = async (platform: PlatformService, s3_params: AmazonParams): Promise<any> => {
        const logger = new Logger(platform)
        const resolved = this.resolveConfig(s3_params)
        const client = this.createClient(s3_params, platform)

        const params = {
            Bucket: resolved.bucket,
            Key: resolved.path + this.TEST_FILE.name,
            Body: this.TEST_FILE.content,
            ACL: this.PERMISSIONS.PRIVATE,
            ContentType: this.TEST_FILE.type,
        }

        try {
            const data = await client.upload(params).promise()
            return { code: 1, data: data }
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString() }
        }
    }

    /**
     * Two-way sync between the local Tabby config and an S3-compatible bucket.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction. Otherwise {@link resolveSyncDirection} compares content
     *  hashes against the recorded baseline to decide.
     */
    async sync (config: ConfigService, platform: PlatformService, params: AmazonParams, firstInit = false): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const resolved = this.resolveConfig(params)
        const client = this.createClient(params, platform)
        const remoteFile = this.getRemoteFileKey(resolved)
        let remoteSyncConfigUpdatedAt: moment.Moment = null

        const uploadObjectParams = {
            Bucket: resolved.bucket,
            Key: remoteFile,
            Body: SettingsHelper.readTabbyConfigFile(platform, true, true),
            ACL: this.PERMISSIONS.PRIVATE,
            ContentType: 'application/json',
        }

        try {
            const data: any = await client.getObject({ Bucket: resolved.bucket, Key: remoteFile }).promise()
            const content = data.Body.toString()
            if (data.LastModified) {
                // A JS `Date` from the SDK, already an absolute instant.
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
                        await client.upload(uploadObjectParams).promise()
                        recordLocalBaselineOnFirstInit(platform, this.provider)
                        result.result = true
                    } else if (SettingsHelper.verifyServerConfigIsValid(content)) {
                        await applyRemoteConfigOnFirstInit(config, platform, this.provider, content)
                        result.result = true
                    } else {
                        result.result = false
                        result.message = CloudSyncLang.trans('common.errors.invalidServerConfig')
                    }
                } else {
                    const outcome = await resolveSyncDirection({
                        config,
                        platform,
                        logger,
                        providerLabel: 'Amazon AWS',
                        adapterId: this.provider,
                        remoteUpdatedAt: remoteSyncConfigUpdatedAt,
                        remoteContent: content,
                        pushToCloud: async () => {
                            await client.upload(uploadObjectParams).promise()
                        },
                    })
                    result.result = outcome.result
                    result.message = outcome.message
                }
            } catch (e) {
                result.result = false
                result.message = e.toString()
                PluginToast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                const copyObjectParams = {
                    CopySource: remoteFile,
                    Bucket: resolved.bucket,
                    Key: remoteFile + '_bk' + new Date().getTime(),
                }
                await client.copyObject(copyObjectParams).promise()
                await client.upload(uploadObjectParams).promise()
                logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
            }
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())

            // Only a genuine "object is not there" justifies publishing the
            // local config. Uploading after a throttling response or a network
            // blip would overwrite a good remote config with whatever this
            // device happens to hold.
            if (!isRemoteMissingError(e)) {
                result.result = false
                result.message = e.toString()
                return result
            }

            try {
                await client.upload(uploadObjectParams).promise()
                recordLocalBaselineOnFirstInit(platform, this.provider)
                result.result = true
            } catch (exception) {
                result.result = false
                result.message = exception.toString()
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        return result
    }

    /**
     * Force-push the local Tabby config to the configured S3 bucket.
     *
     * Concurrency is handled by the shared lock in `SettingsHelper`, so there is
     * no adapter-local re-entrancy flag here any more.
     */
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        this.setProvider(savedConfigs.adapter)
        const params = savedConfigs.configs as AmazonParams
        const resolved = this.resolveConfig(params)
        const client = this.createClient(params, platform)
        const remoteFile = this.getRemoteFileKey(resolved)

        const uploadObjectParams = {
            Bucket: resolved.bucket,
            Key: remoteFile,
            Body: SettingsHelper.readTabbyConfigFile(platform, true, true),
            ACL: this.PERMISSIONS.PRIVATE,
            ContentType: 'application/json',
        }

        try {
            await client.upload(uploadObjectParams).promise()
            logger.log(CloudSyncLang.trans('sync.sync_success'))
            result.result = true
        } catch (e) {
            result.message = e.toString()
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
        }

        return result
    }

    /** Build an AWS S3 client for the resolved provider/endpoint. */
    private createClient (params: AmazonParams, platform: PlatformService): S3 {
        const resolved = this.resolveConfig(params)
        const logger = new Logger(platform)
        const s3Params: any = {
            accessKeyId: resolved.appId,
            secretAccessKey: resolved.appSecret,
            region: resolved.region,
        }

        switch (this.provider) {
            case CloudSyncSettingsData.values.WASABI: {
                logger.log('Fetch Wasabi instance', 'info')
                s3Params.endpoint = new Endpoint(CloudSyncSettingsData.amazonEndpoints.WASABI)
                break
            }

            case CloudSyncSettingsData.values.DIGITAL_OCEAN: {
                logger.log('Fetch Digital instance', 'info')
                delete s3Params.region
                s3Params.endpoint = new Endpoint(CloudSyncSettingsData.amazonEndpoints.DIGITAL_OCEAN.replace('{REGION}', resolved.region))
                break
            }

            case CloudSyncSettingsData.values.BLACKBLAZE: {
                logger.log('Fetch Blackblaze instance', 'info')
                delete s3Params.region
                s3Params.endpoint = new Endpoint(CloudSyncSettingsData.amazonEndpoints.BLACKBLAZE.replace('{REGION}', resolved.region))
                break
            }

            case CloudSyncSettingsData.values.S3_COMPATIBLE: {
                logger.log('Fetch S3 Compatible instance', 'info')
                s3Params.signatureVersion = 'v4'
                s3Params.sslEnabled = params.endpointUrl.includes('https')
                s3Params.s3ForcePathStyle = true
                s3Params.endpoint = new Endpoint(params.endpointUrl)
                break
            }

            default: {
                logger.log('Fetch Amazon instance', 'info')
            }
        }

        return new S3(s3Params)
    }
}

export default new AmazonS3Class()
