import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import * as yaml from 'js-yaml'
import PluginToast from '../../services/toast'
import CloudSyncLang from '../../data/lang'
import { DropboxParams, SyncResult } from '../../interface'
import Logger from '../../utils/Logger'
import moment from 'moment'
import { Dropbox } from 'dropbox'
import { EventEmitter } from '@angular/core'
import { applyRemoteConfigOnFirstInit, isRemoteMissingError, recordLocalBaselineOnFirstInit, resolveSyncDirection } from './sync-utils'

class DropboxSync {
    private _isFirstInit = false
    private _emitter: EventEmitter<any>
    private emitterActions = {
        syncComplete: 'dropbox-sync-complete',
        secretRequired: 'dropbox-encryption-secret-required',
        _syncFileToCloud: 'dropbox-sync-file-to-cloud',
    }

    private readonly adapterId = CloudSyncSettingsData.values.DROPBOX

    /** Wire up the internal emitter so file-to-cloud events resolve the sync. */
    internalEmitterHandler (): void {
        this._emitter?.subscribe((event: { action: string, result: boolean, message?: string }) => {
            if (event.action === this.emitterActions._syncFileToCloud) {
                this._emitter?.emit({
                    action: this.emitterActions.syncComplete,
                    result: true,
                })
            }
        })
    }

    /** Emit a `dropbox-sync-complete` event to any subscribed UI component. */
    private emitSyncComplete (result: boolean, message?: string): void {
        this._emitter?.emit({
            action: this.emitterActions.syncComplete,
            result,
            message,
        })
    }

    /** Ask the provider UI to unlock an existing remote V2 config. */
    private emitEncryptionSecretRequired (remoteContent: string): void {
        this._emitter?.emit({
            action: this.emitterActions.secretRequired,
            result: false,
            message: CloudSyncLang.trans('dropbox.encryption_secret_required'),
            remoteContent,
        })
    }

    /** Read a Dropbox file blob as a UTF-8 string. */
    private readBlob (blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.addEventListener('loadend', () => resolve(reader.result as string))
            reader.addEventListener('error', () => reject(reader.error))
            reader.readAsText(blob)
        })
    }

    /**
     * Two-way sync between the local Tabby config and Dropbox.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction and reports completion through the emitter. Otherwise
     *  {@link resolveSyncDirection} compares content hashes against the
     *  recorded baseline to decide.
     */
    async sync (config: ConfigService, platform: PlatformService, params: DropboxParams, firstInit = false, emitter: EventEmitter<any> = null): Promise<SyncResult> {
        const logger = new Logger(platform)
        this._emitter = emitter
        this.internalEmitterHandler()
        this._isFirstInit = firstInit

        const result: SyncResult = { result: false, message: '' }
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const dbx = new Dropbox({ accessToken: params.accessToken })

        try {
            const response: any = await dbx.filesDownload({ path: remoteFile })
            SettingsHelper.clearLastErrorMessage(platform, CloudSyncSettingsData.values.DROPBOX, params)

            const content = await this.readBlob(response.result.fileBlob)
            // `server_modified` is ISO-8601 with a `Z` offset, so it parses to
            // the correct absolute instant with no timezone conversion needed.
            const remoteSyncConfigUpdatedAt = response.result.server_modified
                ? moment(response.result.server_modified)
                : null
            if (firstInit && SettingsHelper.isV2EncryptedConfig(content) && !SettingsHelper.canDecryptConfig(content)) {
                logger.log('Dropbox remote config uses V2 encryption and requires the custom secret.')
                result.message = CloudSyncLang.trans('dropbox.encryption_secret_required')
                this.emitEncryptionSecretRequired(content)
                return result
            }

            yaml.load(SettingsHelper.doDescryption(content))

            if (firstInit) {
                if ((await platform.showMessageBox({
                    type: 'warning',
                    message: CloudSyncLang.trans('sync.sync_confirmation'),
                    buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                    defaultId: 0,
                })).response === 1) {
                    logger.log('First init. Sync direction: Local to Cloud.')
                    const pushed = await this.uploadLocalSettings(platform, params)
                    if (pushed.result) {
                        recordLocalBaselineOnFirstInit(platform, this.adapterId)
                    }
                    result.result = pushed.result
                    result.message = pushed.message
                } else if (SettingsHelper.verifyServerConfigIsValid(content)) {
                    logger.log('First init. Sync direction: Cloud To Local.')
                    await applyRemoteConfigOnFirstInit(config, platform, this.adapterId, content)
                    result.result = true
                    this.emitSyncComplete(true)
                } else {
                    result.message = CloudSyncLang.trans('common.errors.invalidServerConfig')
                    this.emitSyncComplete(true, result.message)
                }
            } else {
                const outcome = await resolveSyncDirection({
                    config,
                    platform,
                    logger,
                    providerLabel: 'Dropbox',
                    adapterId: this.adapterId,
                    remoteUpdatedAt: remoteSyncConfigUpdatedAt,
                    remoteContent: content,
                    pushToCloud: () => this.uploadLocalSettings(platform, params),
                })
                result.result = outcome.result
                result.message = outcome.message
            }
        } catch (error) {
            logger.log('File download failed: ' + error.toString())
            await this.tryRefreshToken(platform, params, dbx, logger)

            if (this._isFirstInit && isRemoteMissingError(error)) {
                if ((await platform.showMessageBox({
                    type: 'warning',
                    message: CloudSyncLang.trans('sync.confirm_push_local'),
                    buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.sync_from_local')],
                    defaultId: 0,
                })).response === 1) {
                    const pushed = await this.uploadLocalSettings(platform, params)
                    if (pushed.result) {
                        recordLocalBaselineOnFirstInit(platform, this.adapterId)
                    }
                    result.result = pushed.result
                    result.message = pushed.message
                }
            } else {
                result.message = error.message || error.toString()
                this.emitSyncComplete(false, result.message)
            }
        }

        logger.log('Dropbox sync completed result: ' + JSON.stringify(result))
        return result
    }

    /**
     * Attempt to refresh the Dropbox access token using the stored refresh
     * token when a download fails. Persists the refreshed tokens on success.
     */
    private async tryRefreshToken (platform: PlatformService, params: DropboxParams, dbx: Dropbox, logger: Logger): Promise<void> {
        const dropboxForm = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX]
        if (!dropboxForm.apiKey) {
            logger.log('Dropbox app key is not set. Skipping refresh token.')
            return
        }

        logger.log('Try to refresh token')
        try {
            // @ts-ignore
            dbx.auth.setClientId(dropboxForm.apiKey)
            // @ts-ignore
            dbx.auth.setRefreshToken(params.refreshToken)
            // @ts-ignore
            await dbx.auth.refreshAccessToken()

            // @ts-ignore
            params.accessToken = dbx.auth.getAccessToken()
            // @ts-ignore
            params.refreshToken = dbx.auth.getRefreshToken()

            await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)
            logger.log('Refresh token success')
        } catch (e) {
            logger.log('Refresh token failed: ' + e.toString())
            PluginToast.error(e.toString())
        }
    }

    /**
     * Upload the encrypted local config to Dropbox.
     *
     * Kept separate from {@link syncLocalSettingsToCloud} so a push driven by a
     * sync cycle does not have to re-read the stored settings or contend with
     * the shared sync lock, which the cycle already holds.
     */
    private async uploadLocalSettings (platform: PlatformService, params: DropboxParams): Promise<SyncResult> {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

        try {
            const dbx = new Dropbox({ accessToken: params.accessToken })
            await dbx.filesUpload({
                path: remoteFile,
                contents: SettingsHelper.readTabbyConfigFile(platform, true, true),
                mode: 'overwrite' as any,
            })
            logger.log('Dropbox file upload success')
            result.result = true

            if (this._isFirstInit) {
                this.emitSyncComplete(true)
            }

            if (params.lastErrorMessage) {
                params.lastErrorMessage = null
                await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)
            }
        } catch (e) {
            result.message = e.toString()
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))

            params.lastErrorMessage = e.toString()
            await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)

            if (this._isFirstInit) {
                this.emitSyncComplete(false, CloudSyncLang.trans('sync.sync_error'))
            }
        }

        return result
    }

    /**
     * Force-push the local Tabby config to Dropbox.
     *
     * Concurrency is handled by the shared lock in `SettingsHelper`, so there is
     * no adapter-local re-entrancy flag here any more; the old per-adapter flags
     * could silently turn a scheduled push into a no-op that still reported
     * success.
     */
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<SyncResult> {
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        return this.uploadLocalSettings(platform, savedConfigs.configs as DropboxParams)
    }
}

export default new DropboxSync()
