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

let isSyncingInProgress = false
class WebDav {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        const logger = new Logger(platform)
        const result = { result: false, message: '' }
        const client = WebDav.createClient(params)
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        let remoteSyncConfigUpdatedAt = null
        let isAbleToLoadRemoteContent = false

        try {
            await client.stat(remoteFile).then(async (fileStats: any) => {
                isAbleToLoadRemoteContent = true
                if (fileStats?.lastmod) {
                    remoteSyncConfigUpdatedAt = moment(fileStats.lastmod)
                }
                await client.getFileContents(remoteFile, { format: 'text' }).then(async (content: string) => {
                    try {
                        yaml.load(content)
                        if (firstInit) {
                            if ((await platform.showMessageBox({
                                type: 'warning',
                                message: CloudSyncLang.trans('sync.sync_confirmation'),
                                buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                                defaultId: 0,
                            })).response === 1) {
                                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true })
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
                            await fs.stat(filePath, (err, stats: any) => {
                                //Checking for errors
                                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                                if (err){
                                    logger.log(err)
                                } else {
                                    localFileUpdatedAt = moment(stats.mtime)
                                    logger.log('Auto Sync WebDav')
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
                        await client.moveFile(remoteFile, remoteFile + '_bk' + new Date().getTime())
                        await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true })
                        logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
                    }
                })
            })
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())
            try {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true })
                result['result'] = true
            } catch (exception) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (!isAbleToLoadRemoteContent) {
            if ((await platform.showMessageBox({
                type: 'warning',
                message: 'Seem to be server has no file or the setting file is corrupted. Do you want to push local file to the cloud?',
                buttons: ['Cancel', 'Yes'],
                defaultId: 0,
            })).response === 1) {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true })
                result['result'] = true
            } else {
                // Do Nothing
            }
        }
        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
        const logger = new Logger(platform)
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs
            const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
            const client = WebDav.createClient(params)

            try {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true }).then(() => {
                    logger.log(CloudSyncLang.trans('sync.sync_success'))
                })
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
export default new WebDav()
