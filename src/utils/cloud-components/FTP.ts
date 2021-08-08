import CloudSyncSettingsData from "../../data/setting-items"
import SettingsHelper from "../settings-helper"
import {ConfigService, PlatformService} from "terminus-core"
import * as yaml from 'js-yaml'
import {ToastrService} from "ngx-toastr"
import CloudSyncLang from "../../data/lang";
import {FtpParams} from "../../interface";
import {fsReadFile} from "ts-loader/dist/utils";
import {Client} from "basic-ftp";

const fs = require('fs')
const path = require('path')
let isSyncingInProgress = false
class FTP {
    async sync (config: ConfigService, platform: PlatformService, toast: ToastrService, params, firstInit = false) {
        let result = false
        const client: Client = await FTP.createClient(params)
        const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
        const tempFileLocal = path.dirname(platform.getConfigPath()) +  '/tabby-sync.tmp'
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
                        } else {
                            config.writeRaw(SettingsHelper.doDescryption(content))
                        }
                    } else {
                        config.writeRaw(SettingsHelper.doDescryption(content))
                    }
                } catch (_) {
                    toast.error(CloudSyncLang.trans('sync.error_invalid_setting'))
                    await client.rename(remoteFile, remoteFile + '_bk' + new Date().getTime())
                    await this.uploadLocalSettings(params, client, platform, toast)
                }
                result = true
                fs.unlinkSync(tempFileLocal)
            } else {
                await this.uploadLocalSettings(params, client, platform, toast)
            }
        } catch (_) {
            try {
                await this.uploadLocalSettings(params, client, platform, toast)
                result = true
            } catch (_) {}
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
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs
            const localFile = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile
            const remoteFile = params.location + CloudSyncSettingsData.cloudSettingsFilename
            const client: Client = await FTP.createClient(params)

            try {
                await SettingsHelper.generateEncryptedTabbyFileForUpload(platform).then(async status => {
                    if (status) {
                        await client.uploadFrom(localFile, remoteFile).then(result => {
                            if (result.code !== 226) {
                                toast.error(CloudSyncLang.trans('sync.sync_error'))
                            }
                            fs.unlinkSync(localFile)
                            console.log(result)
                        })
                    } else {
                        toast.error(CloudSyncLang.trans('sync.sync_error'))
                    }
                })

            } catch (_) {
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                }
            }
            isSyncingInProgress = false
        }
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
