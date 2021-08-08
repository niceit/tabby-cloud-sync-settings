import { AuthType, createClient } from 'webdav'
import CloudSyncSettingsData from "../../data/setting-items"
import SettingsHelper from "../settings-helper"
import {ConfigService, PlatformService} from "terminus-core"
import * as yaml from 'js-yaml'
import {ToastrService} from "ngx-toastr"
import CloudSyncLang from "../../data/lang";

let isSyncingInProgress = false
class WebDav {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        let result = false
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
                            config.writeRaw(SettingsHelper.doDescryption(content))
                        }
                    } else {
                        config.writeRaw(SettingsHelper.doDescryption(content))
                    }
                } catch (_) {
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    await client.moveFile(remoteFile, remoteFile + '_bk' + new Date().getTime())
                    await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), {overwrite: true}).then(() => {})
                }
                result = true
            })
        } catch (_) {
            try {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true, true), { overwrite: true }).then(() => {})
                result = true
            } catch (_) { }
        }

        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService) {
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
            } catch (_) {
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
