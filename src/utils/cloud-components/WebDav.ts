import { AuthType, createClient } from 'webdav'
import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import * as yaml from 'js-yaml'
import PluginToast from '../../services/toast'
import CloudSyncLang from '../../data/lang'
import { SyncResult, WebDavParams } from '../../interface'
import Logger from '../../utils/Logger'
import moment from 'moment'
import { applyRemoteConfigOnFirstInit, isRemoteMissingError, recordLocalBaselineOnFirstInit, resolveSyncDirection } from './sync-utils'

class WebDav {
    private readonly adapterId = CloudSyncSettingsData.values.WEBDAV

    /**
     * Two-way sync between the local Tabby config and a WebDav server.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction. Otherwise {@link resolveSyncDirection} compares content
     *  hashes against the recorded baseline to decide.
     */
    async sync (config: ConfigService, platform: PlatformService, params: WebDavParams, firstInit = false): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const client = WebDav.createClient(params)
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        let remoteSyncConfigUpdatedAt: moment.Moment = null

        try {
            const fileStats: any = await client.stat(remoteFile)
            if (fileStats?.lastmod) {
                // RFC1123 (`... GMT`) parses to the correct absolute instant, so
                // no timezone conversion is needed or wanted here.
                remoteSyncConfigUpdatedAt = moment(fileStats.lastmod)
            }

            const content = await client.getFileContents(remoteFile, { format: 'text' }) as string
            try {
                yaml.load(content)
                if (firstInit) {
                    if ((await platform.showMessageBox({
                        type: 'warning',
                        message: CloudSyncLang.trans('sync.sync_confirmation'),
                        buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                        defaultId: 0,
                    })).response === 1) {
                        await this.uploadLocalSettings(client, platform, remoteFile)
                        recordLocalBaselineOnFirstInit(platform, this.adapterId)
                        result.result = true
                    } else if (SettingsHelper.verifyServerConfigIsValid(content)) {
                        await applyRemoteConfigOnFirstInit(config, platform, this.adapterId, content)
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
                        providerLabel: 'WebDav',
                        adapterId: this.adapterId,
                        remoteUpdatedAt: remoteSyncConfigUpdatedAt,
                        remoteContent: content,
                        pushToCloud: () => this.uploadLocalSettings(client, platform, remoteFile),
                    })
                    result.result = outcome.result
                    result.message = outcome.message
                }
            } catch (e) {
                result.result = false
                result.message = e.toString()
                PluginToast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                await client.moveFile(remoteFile, remoteFile + '_bk' + new Date().getTime())
                await this.uploadLocalSettings(client, platform, remoteFile)
                logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
            }
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())

            // Only a genuine "file is not there" justifies publishing the local
            // config. Uploading after a transient network or server error would
            // overwrite a perfectly good remote config with whatever this device
            // happens to hold.
            if (!isRemoteMissingError(e)) {
                result.message = e.toString()
                return result
            }

            if (!firstInit) {
                try {
                    await this.uploadLocalSettings(client, platform, remoteFile)
                    recordLocalBaselineOnFirstInit(platform, this.adapterId)
                    result.result = true
                } catch (exception) {
                    result.message = exception.toString()
                    logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
                }

                return result
            }

            // Interactive setup: let the user decide, since this is the point at
            // which an empty remote is expected.
            if ((await platform.showMessageBox({
                type: 'warning',
                message: CloudSyncLang.trans('sync.confirm_push_local'),
                buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.yes')],
                defaultId: 0,
            })).response === 1) {
                try {
                    await this.uploadLocalSettings(client, platform, remoteFile)
                    recordLocalBaselineOnFirstInit(platform, this.adapterId)
                    result.result = true
                } catch (exception) {
                    result.message = exception.toString()
                    logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
                }
            }
        }

        return result
    }

    /**
     * Upload the encrypted local config to the given remote path.
     *
     * Kept separate from {@link syncLocalSettingsToCloud} so a push driven by a
     * sync cycle does not have to re-read the stored settings or contend with
     * the shared sync lock, which the cycle already holds.
     */
    private async uploadLocalSettings (client: any, platform: PlatformService, remoteFile: string): Promise<void> {
        await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true })
    }

    /**
     * Force-push the local Tabby config to the WebDav server.
     *
     * Concurrency is handled by the shared lock in `SettingsHelper`, so there is
     * no adapter-local re-entrancy flag here any more; the old per-adapter flags
     * could silently turn a scheduled push into a no-op that still reported
     * success.
     */
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        const params = savedConfigs.configs
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const client = WebDav.createClient(params)

        try {
            await this.uploadLocalSettings(client, platform, remoteFile)
            // This entry point is also called directly by the settings UI, which
            // does not go through `SettingsHelper`, so record the baseline here
            // too or the next cycle would treat the upload as a local change.
            recordLocalBaselineOnFirstInit(platform, this.adapterId)
            logger.log(CloudSyncLang.trans('sync.sync_success'))
            result.result = true
        } catch (e) {
            result.message = e.toString()
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
        }

        return result
    }

    /** Build a WebDav client from the stored connection params. */
    private static createClient (params: WebDavParams) {
        return createClient(params.host + (params.port ? ':' + params.port : ''), {
            authType: AuthType.Password,
            username: params.username,
            password: params.password,
        })
    }
}

export default new WebDav()
