// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { AuthType, createClient } from 'webdav'
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

let isSyncingInProgress = false
class DropboxSync {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        const logger = new Logger(platform)
        const result = { result: false, message: '' }
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        let remoteSyncConfigUpdatedAt = null
        let isAbleToLoadRemoteContent = false
        const dbx = new Dropbox({ accessToken: params.accessToken })

        try {
            dbx.filesDownload({ path:  remoteFile }).then((response: any) => {
                logger.log('Dropbox file downloaded result: ' + response.toString());
                const reader = new FileReader()
                const blob: Blob = response.fileBlob
                reader.addEventListener('loadend', async (e) => {
                    logger.log(('Dropbox file reader: ' + e.toString()))
                    const content =  JSON.parse(reader.result as string)
                    logger.log('Dropbox file download success')
                    console.log('Dropbox file content: ' + content)
                    remoteSyncConfigUpdatedAt = moment(response.server_modified)
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            await this.syncLocalSettingsToCloud(platform, toast)
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
                result['result'] = await this.syncLocalSettingsToCloud(platform, toast)
            })
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())
            try {
                result['result'] = await this.syncLocalSettingsToCloud(platform, toast)
            } catch (exception) {
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
            logger.log('savedConfigs: ' + JSON.stringify(savedConfigs))
            const params = savedConfigs.configs
            const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

            try {
                const dbx = new Dropbox({ accessToken: params.accessToken })

                dbx.filesUpload({ path: remoteFile, contents: SettingsHelper.readTabbyConfigFile(platform, true, true) })
                    .then((response: any) => {
                        logger.log('Dropbox file upload success');
                        logger.log(response.toString());
                    })
                    .catch((uploadErr) => {
                        logger.log('Dropbox file upload failed', 'error')
                        logger.log(uploadErr.toString(), 'error')
                        toast.error(uploadErr.message)
                    });

                return true
            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                toast.error(CloudSyncLang.trans('sync.sync_error'))
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (isSyncingInProgress) {
                    logger.log(CloudSyncLang.trans('sync.sync_success'))
                }
            }
            isSyncingInProgress = false
        }

        return false
    }

    private static createClient (params) {
        return createClient(params.host + (params.port ? ':' + params.port : ''), {
            authType: AuthType.Password,
            username: params.username,
            password: params.password,
        })
    }
}
export default new DropboxSync()
