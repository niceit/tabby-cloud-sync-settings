// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import * as yaml from 'js-yaml'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../data/lang'
import Logger from '../../utils/Logger'
import path from 'path'
import fs from 'fs'
import moment from 'moment'
import {Dropbox} from "dropbox";
import {EventEmitter} from "@angular/core";

let isSyncingInProgress = false
class DropboxSync {

    private _isFirstInit = false
    private _emitter: EventEmitter<any>
    private emitterActions = {
        syncComplete: 'dropbox-sync-complete',
        _syncFileToCloud: 'dropbox-sync-file-to-cloud',
    }

    internalEmitterHandler () {
        this._emitter?.subscribe(async (event: { action: string, result: boolean, message?: string }) => {
            switch (event.action) {
                case this.emitterActions._syncFileToCloud: {
                    this._emitter?.emit({
                        action: this.emitterActions.syncComplete,
                        result: true,
                    })
                    break
                }
            }
        })
    }

    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params: any, firstInit = false, emitter: EventEmitter<any> = null) {
        const logger = new Logger(platform)
        this._emitter = emitter
        this.internalEmitterHandler()

        this._isFirstInit = firstInit
        const result = { result: false, message: '' }
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        let remoteSyncConfigUpdatedAt = null
        const dbx = new Dropbox({ accessToken: params.accessToken })

        try {
            dbx.filesDownload({ path:  remoteFile }).then((response: any) => {
                SettingsHelper.clearLastErrorMessage(platform, CloudSyncSettingsData.values.DROPBOX, params)
                logger.log('Dropbox file downloaded result: ' + JSON.stringify(response))

                const reader = new FileReader()
                const blob: Blob = response.result.fileBlob
                reader.addEventListener('loadend', async (e) => {
                    logger.log(('Dropbox file reader: ' + e.toString()))
                    const content =  reader.result as string

                    logger.log('Dropbox file download success')
                    remoteSyncConfigUpdatedAt = moment(response.server_modified)
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            logger.log('First init. Sync direction: Local to Cloud.')
                            await this.syncLocalSettingsToCloud(platform, toast)
                        } else {
                            logger.log('First init. Sync direction: Cloud To Local.')
                            if (SettingsHelper.verifyServerConfigIsValid(content)) {
                                await SettingsHelper.backupTabbyConfigFile(platform)
                                config.writeRaw(SettingsHelper.doDescryption(content))
                                this._emitter?.emit({
                                    action: this.emitterActions.syncComplete,
                                    result: true,
                                })

                                if (params.lastErrorMessage) {
                                    params.lastErrorMessage = null
                                    await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)
                                }
                            } else {
                                emitter?.emit({
                                    action: this.emitterActions.syncComplete,
                                    result: true,
                                    message: CloudSyncLang.trans('common.errors.invalidServerConfig'),
                                })
                            }
                        }
                    } else {
                        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
                        let localFileUpdatedAt = null
                        // eslint-disable-next-line @typescript-eslint/await-thenable,@typescript-eslint/no-confusing-void-expression
                        fs.stat(filePath, (err, stats: any) => {
                            //Checking for errors
                            if (err) {
                                logger.log(err)
                            } else {
                                localFileUpdatedAt = moment(stats.mtime)

                                logger.log('Auto Sync Dropbox')
                                logger.log('Server Updated At ' + (remoteSyncConfigUpdatedAt ? remoteSyncConfigUpdatedAt.format('YYYY-MM-DD HH:mm:ss') : null))
                                logger.log('Local Updated At ' + localFileUpdatedAt.format('YYYY-MM-DD HH:mm:ss'))

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
                })
                reader.readAsText(blob)
            }).catch(async (error: any) => {
                logger.log('File download failed: ' + error.toString())

                params.lastErrorMessage = error.toString()
                await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)

                logger.log('Try to refresh token')
                if (CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX].apiKey && CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX].apiSecret)
                {
                    // Try to refresh token
                    try {
                        // @ts-ignore
                        dbx.auth.setClientId(CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX].apiKey)
                        // @ts-ignore
                        dbx.auth.setClientSecret(CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX].apiSecret)
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
                        toast.error(e.toString())
                        return
                    }
                }
                else {
                    logger.log('Dropbox API Key and Secret is not set. Skipping refresh token.')
                }

                if (this._isFirstInit) {
                    if ((await platform.showMessageBox({
                        type: 'warning',
                        message: 'Unable to download file or file is not exist on cloud. Do you want to sync from local?',
                        buttons: ['Cancel', CloudSyncLang.trans('buttons.sync_from_local')],
                        defaultId: 0,
                    })).response === 1) {
                        await this.syncLocalSettingsToCloud(platform, toast)
                        result['result'] = true
                    }
                }
            })
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())

            params.lastErrorMessage = e.toString()
            await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)

            try {
                if (this._isFirstInit) {
                    if ((await platform.showMessageBox({
                        type: 'warning',
                        message: 'Unable to download file or file is not exist on cloud. Do you want to sync from local?',
                        buttons: ['Cancel', CloudSyncLang.trans('buttons.sync_from_local')],
                        defaultId: 0,
                    })).response === 1) {
                        this.syncLocalSettingsToCloud(platform, toast)
                        result['result'] = true
                    }
                }
            } catch (exception) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        logger.log('Dropbox sync completed result: ' + JSON.stringify(result))
        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
        const logger = new Logger(platform)
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs
            const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

            try {
                const dbx = new Dropbox({ accessToken: params.accessToken })
                dbx.filesUpload({ path: remoteFile, contents: SettingsHelper.readTabbyConfigFile(platform, true, true), mode: 'overwrite' as any })
                    .then(async (response: any) => {
                        logger.log('Dropbox file upload success');
                        logger.log(JSON.stringify(response));

                        if (this._isFirstInit) {
                            this._emitter?.emit({
                                action: this.emitterActions.syncComplete,
                                result: true,
                            })
                        }

                        // Clear last error message
                        if (params.lastErrorMessage) {
                            params.lastErrorMessage = null
                            await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)
                        }
                    })
                    .catch((uploadErr) => {
                        logger.log('Dropbox file upload failed', 'error')
                        logger.log(uploadErr.toString(), 'error')
                        toast.error(uploadErr.message)

                        if (this._isFirstInit) {
                            this._emitter?.emit({
                                action: this.emitterActions.syncComplete,
                                result: false,
                                message: uploadErr.message,
                            })
                        }
                    });
            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                toast.error(CloudSyncLang.trans('sync.sync_error'))
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (isSyncingInProgress) {
                    logger.log(CloudSyncLang.trans('sync.sync_success'))
                }

                params.lastErrorMessage = e.toString()
                await SettingsHelper.saveSettingsToFile(platform, CloudSyncSettingsData.values.DROPBOX, params)

                if (this._isFirstInit) {
                    this._emitter?.emit({
                        action: this.emitterActions.syncComplete,
                        result: false,
                        message: CloudSyncLang.trans('sync.sync_error'),
                    })
                }
            }
            isSyncingInProgress = false
        }
    }
}
export default new DropboxSync()
