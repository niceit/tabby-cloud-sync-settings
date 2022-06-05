// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import * as yaml from 'js-yaml'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../data/lang'
import { FtpParams } from '../../interface'
import { fsReadFile } from 'ts-loader/dist/utils'
import { Client } from 'basic-ftp'
import Logger from '../../utils/Logger'
import moment from 'moment'

const fs = require('fs')
const path = require('path')
let isSyncingInProgress = false
class FTP {
    private ftpClient = null
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        const logger = new Logger(platform)
        const result = { result: false, message: '' }
        if (!this.ftpClient) {
            this.ftpClient = await FTP.createClient(params)
        }

        const client: Client = this.ftpClient
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const tempFileLocal = path.dirname(platform.getConfigPath()) +  '/tabby-sync.tmp'
        let remoteSyncConfigUpdatedAt = null

        try {
            await client.downloadTo(tempFileLocal, remoteFile)
            if (fs.existsSync(tempFileLocal)) {
                const content = fsReadFile(tempFileLocal, 'utf8')
                try {
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            await this.uploadLocalSettings(params, client, platform, toast)
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
                        await client.lastMod(remoteFile).then(async mTime => {
                            remoteSyncConfigUpdatedAt = moment(mTime)

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
                                    logger.log('Auto Sync FTP')
                                    logger.log('Server Updated At ' + (remoteSyncConfigUpdatedAt ? remoteSyncConfigUpdatedAt.format('YYYY-MM-DD HH:mm:ss') : null))
                                    logger.log('Local Updated At '+ localFileUpdatedAt.format('YYYY-MM-DD HH:mm:ss'))

                                    if (remoteSyncConfigUpdatedAt && remoteSyncConfigUpdatedAt > localFileUpdatedAt) {
                                        logger.log('Sync direction: Cloud to local.')
                                        config.writeRaw(SettingsHelper.doDescryption(content))
                                    } else {
                                        logger.log('Sync direction: Local To Cloud.')
                                        this.uploadLocalSettings(params, client, platform, toast)
                                    }
                                }
                            })
                            result['result'] = true
                        })
                    }
                } catch (e) {
                    result['result'] = false
                    result['message'] = e.toString()
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    await client.rename(remoteFile, remoteFile + '_bk' + new Date().getTime())
                    await this.uploadLocalSettings(params, client, platform, toast)
                    logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
                }
            } else {
                await this.uploadLocalSettings(params, client, platform, toast)
                result['result'] = true
            }
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())
            try {
                await this.uploadLocalSettings(params, client, platform, toast)
                result['result'] = true
            } catch (exception) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + exception.toString(), 'error')
            }
        }

        return result
    }

    private async uploadLocalSettings (params, client, platform, toast) {
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        await SettingsHelper.generateEncryptedTabbyFileForUpload(platform).then(async status => {
            if (status) {
                await client.uploadFrom(path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile, remoteFile).then(result => {
                    if (result.code !== 226) {
                        toast.error(CloudSyncLang.trans('sync.sync_error'))
                    }
                })
            } else {
                toast.error(CloudSyncLang.trans('sync.sync_error'))
            }
        })
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
        const logger = new Logger(platform)
        let result = false
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs
            const localFile = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile
            const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

            if (!this.ftpClient) {
                this.ftpClient = await FTP.createClient(params)
            }
            const client: Client = this.ftpClient

            try {
                await SettingsHelper.generateEncryptedTabbyFileForUpload(platform).then(async status => {
                    if (status) {
                        result = await client.uploadFrom(localFile, remoteFile).then(response => {
                            if (response.code !== 226) {
                                toast.error(CloudSyncLang.trans('sync.sync_error'))
                                return false
                            } else {
                                logger.log(CloudSyncLang.trans('sync.sync_success'))
                            }
                            return true
                        })
                    } else {
                        toast.error(CloudSyncLang.trans('sync.sync_error'))
                        result = false
                    }
                })

            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                    result = false
                }
            }
            isSyncingInProgress = false
        }

        return result
    }

    private static async createClient (params: FtpParams): Promise<Client>  {
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
