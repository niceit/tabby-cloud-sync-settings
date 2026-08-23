import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import * as yaml from 'js-yaml'
import PluginToast from '../../services/toast'
import CloudSyncLang from '../../data/lang'
import { FtpParams, SyncResult } from '../../interface'
import { Client } from 'basic-ftp'
import Logger from '../../utils/Logger'
import moment from 'moment'
import { applyRemoteConfigOnFirstInit, isRemoteMissingError, recordLocalBaselineOnFirstInit, resolveSyncDirection } from './sync-utils'

const fs = require('fs')
const path = require('path')

/** Result of downloading the remote config to a local temp file. */
interface RemoteDownload {
    /**
     * `ok` the file was downloaded whole, `missing` the server has no config
     * yet, `incomplete` the transfer produced a partial file and must not be
     * trusted.
     */
    status: 'ok' | 'missing' | 'incomplete',
    content: string,
    message: string,
}

class FTP {
    private ftpClient: Client = null

    private readonly adapterId = CloudSyncSettingsData.values.FTP

    /**
     * Two-way sync between the local Tabby config and an FTP/FTPS server.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction. Otherwise {@link resolveSyncDirection} compares content
     *  hashes against the recorded baseline to decide.
     */
    async sync (config: ConfigService, platform: PlatformService, params: FtpParams, firstInit = false): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        if (!this.ftpClient) {
            this.ftpClient = await FTP.createClient(params)
        }

        const client: Client = this.ftpClient
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const tempFileLocal = path.dirname(platform.getConfigPath()) + '/tabby-sync.tmp'

        try {
            const download = await this.downloadRemoteConfig(client, remoteFile, tempFileLocal, logger)

            if (download.status === 'missing') {
                const pushed = await this.uploadLocalSettings(params, client, platform)
                if (pushed.result) {
                    recordLocalBaselineOnFirstInit(platform, this.adapterId)
                }
                return pushed
            }

            // A half-transferred file is indistinguishable from a valid one once
            // it is on disk, so bail out and retry on the next cycle rather than
            // risk pushing over (or pulling from) a corrupt payload.
            if (download.status === 'incomplete') {
                logger.log('Auto Sync FTP: ' + download.message, 'error')
                result.message = download.message
                return result
            }

            const content = download.content
            try {
                yaml.load(content)
                if (firstInit) {
                    if ((await platform.showMessageBox({
                        type: 'warning',
                        message: CloudSyncLang.trans('sync.sync_confirmation'),
                        buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                        defaultId: 0,
                    })).response === 1) {
                        const pushed = await this.uploadLocalSettings(params, client, platform)
                        if (pushed.result) {
                            recordLocalBaselineOnFirstInit(platform, this.adapterId)
                        }
                        result.result = pushed.result
                        result.message = pushed.message
                    } else if (SettingsHelper.verifyServerConfigIsValid(content)) {
                        await applyRemoteConfigOnFirstInit(config, platform, this.adapterId, content)
                        result.result = true
                    } else {
                        result.result = false
                        result.message = CloudSyncLang.trans('common.errors.invalidServerConfig')
                    }
                } else {
                    // `MDTM` is second-granularity, which is why the comparison
                    // in `resolveSyncDirection` applies a skew tolerance.
                    const remoteSyncConfigUpdatedAt: moment.Moment = moment(await client.lastMod(remoteFile))
                    const outcome = await resolveSyncDirection({
                        config,
                        platform,
                        logger,
                        providerLabel: 'FTP',
                        adapterId: this.adapterId,
                        remoteUpdatedAt: remoteSyncConfigUpdatedAt,
                        remoteContent: content,
                        pushToCloud: () => this.uploadLocalSettings(params, client, platform),
                    })
                    result.result = outcome.result
                    result.message = outcome.message
                }
            } catch (e) {
                result.result = false
                result.message = e.toString()
                PluginToast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                await client.rename(remoteFile, remoteFile + '_bk' + new Date().getTime())
                await this.uploadLocalSettings(params, client, platform)
                logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
            }
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())

            // Only a genuine "file is not there" justifies publishing the local
            // config; a dropped connection or an auth failure must not cause an
            // overwrite of a good remote config.
            if (!isRemoteMissingError(e)) {
                result.message = e.toString()
                return result
            }

            try {
                const pushed = await this.uploadLocalSettings(params, client, platform)
                if (pushed.result) {
                    recordLocalBaselineOnFirstInit(platform, this.adapterId)
                }
                result.result = pushed.result
                result.message = pushed.message
            } catch (exception) {
                result.message = exception.toString()
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        return result
    }

    /**
     * Download the remote config into `tempFileLocal` and check that it arrived
     * whole.
     *
     * `Client.downloadTo` creates the destination file *before* the transfer
     * starts, so a connection dropped half way through leaves a file that
     * exists and may even parse as YAML. Comparing the local size against the
     * server's `SIZE` is what turns that silent corruption into a detectable
     * error.
     */
    private async downloadRemoteConfig (client: Client, remoteFile: string, tempFileLocal: string, logger: Logger): Promise<RemoteDownload> {
        let remoteSize: number = null
        try {
            remoteSize = await client.size(remoteFile)
        } catch (e) {
            // Not all servers implement SIZE; fall back to a size-less check.
            logger.log('FTP SIZE command unavailable, skipping the transfer integrity check: ' + e.toString())
        }

        await client.downloadTo(tempFileLocal, remoteFile)
        if (!fs.existsSync(tempFileLocal)) {
            return { status: 'missing', content: '', message: '' }
        }

        const localSize = fs.statSync(tempFileLocal).size
        if (localSize === 0) {
            return { status: 'incomplete', content: '', message: 'the downloaded cloud config is empty' }
        }

        if (remoteSize !== null && remoteSize !== localSize) {
            return {
                status: 'incomplete',
                content: '',
                message: `the cloud config download was truncated (expected ${remoteSize} bytes, got ${localSize})`,
            }
        }

        return { status: 'ok', content: fs.readFileSync(tempFileLocal, 'utf8'), message: '' }
    }

    /**
     * Encrypt the local config and upload it to the configured remote path.
     *
     * Returns a {@link SyncResult} rather than `void`: a failed upload used to
     * only raise a toast, so a sync cycle would record a baseline for content
     * the server never received and then believe both sides agreed.
     */
    private async uploadLocalSettings (params: FtpParams, client: Client, platform: PlatformService): Promise<SyncResult> {
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const status = await SettingsHelper.generateEncryptedTabbyFileForUpload(platform)
        if (!status) {
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
            return { result: false, message: CloudSyncLang.trans('sync.sync_error') }
        }

        const localFile = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile
        const response = await client.uploadFrom(localFile, remoteFile)
        if (response.code !== 226) {
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
            return { result: false, message: 'FTP upload returned code ' + response.code }
        }

        return { result: true, message: '' }
    }

    /**
     * Force-push the local Tabby config to the FTP server.
     *
     * Concurrency is handled by the shared lock in `SettingsHelper`, so there is
     * no adapter-local re-entrancy flag here any more; the old per-adapter flags
     * could silently turn a scheduled push into a no-op that still reported
     * success.
     */
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<SyncResult> {
        const logger = new Logger(platform)
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        const params = savedConfigs.configs as FtpParams

        if (!this.ftpClient) {
            this.ftpClient = await FTP.createClient(params)
        }

        try {
            const pushed = await this.uploadLocalSettings(params, this.ftpClient, platform)
            if (pushed.result) {
                logger.log(CloudSyncLang.trans('sync.sync_success'))
            }
            return pushed
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
            return { result: false, message: e.toString() }
        }
    }

    /** Establish an authenticated FTP/FTPS connection. */
    private static async createClient (params: FtpParams): Promise<Client> {
        const ftp = require('basic-ftp')
        const client = new ftp.Client()
        client.ftp.verbose = true

        await client.access({
            host: params.host,
            user: params.username,
            password: params.password,
            secure: params.protocol !== 'ftp',
        })

        return client
    }
}

export default new FTP()
