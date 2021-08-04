import { AuthType, createClient } from 'webdav'
import CloudSyncSettingsData from "../../data/setting-items"
import SettingsHelper from "../settings-helper"
import {ConfigService, PlatformService} from "terminus-core"
import * as yaml from 'js-yaml'
import {ToastrService} from "ngx-toastr"

class WebDav {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        let result = false
        const client = createClient(params.host +':'+ params.port, {
            authType: AuthType.Password,
            username: params.username,
            password: params.password,
        })
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename

        try {
            await client.getFileContents(remoteFile, { format: "text" }).then(async (content: string) => {
                try {
                    yaml.load(content)
                    if (firstInit) {
                        if ((await platform.showMessageBox({
                            type: 'warning',
                            message: 'We found cloud setting. Please choose the sync direction!',
                            buttons: ['Sync Cloud Settings', 'Upload Local Settings'],
                            defaultId: 0,
                        })).response === 1) {
                            await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true), {overwrite: true}).then(() => {})
                        } else {
                            config.writeRaw(content)
                        }
                    } else {
                        config.writeRaw(content)
                    }
                } catch (_) {
                    toast.error('Your setting cloud file contains invalid settings. Local file synced up instead!')
                    await client.moveFile(remoteFile, remoteFile + '_bk' + new Date().getTime())
                    await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true), {overwrite: true}).then(() => {})
                }
                result = true
            })
        } catch (_) {
            try {
                await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true), { overwrite: true }).then(() => {})
                result = true
            } catch (e) {
                console.log('exception', e)
            }
        }

        return result
    }

    async syncLocalSettingsToCloud (platform: PlatformService) {
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        const params = savedConfigs.configs
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const client = createClient(params.host +':'+ params.port, {
            authType: AuthType.Password,
            username: params.username,
            password: params.password,
        })

        // TODO Tran Check 423 Lock
        await client.putFileContents(remoteFile, SettingsHelper.readTabbyConfigFile(platform, true), {overwrite: true}).then(() => {})
    }
}
export default new WebDav()
