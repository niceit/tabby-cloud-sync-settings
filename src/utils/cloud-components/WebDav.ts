import { AuthType, createClient } from 'webdav'
import CloudSyncSettingsData from "../../data/setting-items"
import SettingsHelper from "../settings-helper"
import {ConfigService, PlatformService} from "terminus-core"
import * as yaml from 'js-yaml'
import {ToastrService} from "ngx-toastr"
import CloudSyncLang from "../../data/lang"
import Logger from '../../utils/Logger'

let isSyncingInProgress = false
class WebDav {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        const logger = new Logger(platform)
        let result = {result: false, message: ''}
        const client = WebDav.createClient(params)
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

        try {
            await client.getFileContents(remoteFile, { format: "text" }).then(async (content: string) => {
                try {
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: CloudSyncLang.trans('sync.sync_confirmation'),
                            buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                            defaultId: 0,
                        })).response === 1) {
                            await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), {overwrite: true}).then(() => {})
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
                        config.writeRaw(SettingsHelper.doDescryption(content))
                        result['result'] = true
                    }
                } catch (e) {
                    result['result'] = false
                    result['message'] = e.toString()
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    await client.moveFile(remoteFile, remoteFile + '_bk' + new Date().getTime())
                    await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), {overwrite: true}).then(() => {})
                    logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString(), 'error')
                }
            })
        } catch (e) {
            logger.log(CloudSyncLang.trans('log.read_cloud_settings') + ' | Exception: ' + e.toString())
            try {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true }).then(() => {})
                result['result'] = true
            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
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
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), {overwrite: true}).then(() => {
                    toast.info(CloudSyncLang.trans('sync.sync_success'))
                })
            } catch (e) {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                }
            }
            isSyncingInProgress = false
        }
    }

    private static createClient (params) {
        return createClient(params.host + (params.port ? (':' + params.port) : ''), {
            authType: AuthType.Password,
            username: params.username,
            password: params.password,
        })
    }
}
export default new WebDav()
