import {fsReadFile} from "ts-loader/dist/utils"
import {ConfigService, PlatformService} from "terminus-core"
import CloudSyncSettingsData from "../data/setting-items"
import {ToastrService} from "ngx-toastr";
import WebDav from "./cloud-components/WebDav";
import CloudSyncLang from "../data/lang";
import AmazonS3 from "./cloud-components/AmazonS3";
import FTP from "./cloud-components/FTP";

const fs = require('fs')
const path = require('path');
const CryptoJS = require("crypto-js");

export class SettingsHelperClass {
    private adapterHandler = {
        [CloudSyncSettingsData.values.WEBDAV]: WebDav,
        [CloudSyncSettingsData.values.S3]: AmazonS3,
        [CloudSyncSettingsData.values.WASABI]: AmazonS3,
        [CloudSyncSettingsData.values.FTP]: FTP,
    }
    private generatedCryptoHash = 'tp!&nc3^to8y7^3#4%2%&szufx!'

    async saveSettingsToFile (platform: PlatformService, adapter: string, params: any): Promise<any> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        const settingsArr = {
            adapter: adapter,
            enabled: true,
            configs: params,
        }
        if (fs.existsSync(filePath)) {
            const savedConfigs = this.readConfigFile(platform)
            settingsArr.enabled = savedConfigs !== null ? savedConfigs['enabled'] : true
        }
        const fileContent = CloudSyncLang.trans('common.config_inject_header') + CryptoJS.AES.encrypt(JSON.stringify(settingsArr), this.generatedCryptoHash).toString()

        try {
            const promise = new Promise((resolve, reject) => {
                return fs.writeFile(filePath, fileContent,
                    (err) => {
                    if (err) {
                        reject(false)
                    }

                    resolve(true)
                })
            })

            return await promise.then(status => {
                return status
            })
        } catch (e) {
            return false
        }
    }

    async generateEncryptedTabbyFileForUpload(platform: PlatformService) {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile
        try {
            const tabbyConfig = this.readTabbyConfigFile(platform, true, true)
            const promise = new Promise((resolve, reject) => {
                return fs.writeFile(filePath, tabbyConfig,
                    (err) => {
                        if (err) {
                            reject(false)
                        }

                        resolve(true)
                    })
            })

            return await promise.then(status => {
                return status
            })
        } catch (e) {
            return false
        }
    }

    async syncWithCloud (config: ConfigService, platform: PlatformService, toast: ToastrService, firstInit = false) {
        const savedConfigs = this.readConfigFile(platform)
        let result = false
        if (savedConfigs.enabled) {
            if (savedConfigs.adapter === CloudSyncSettingsData.values.S3 || savedConfigs.adapter === CloudSyncSettingsData.values.WASABI) {
                AmazonS3.setProvider(savedConfigs.adapter)
            }
            await this.adapterHandler[savedConfigs.adapter].sync(config, platform, toast, savedConfigs.configs, firstInit).then(status => {
                result = status
            })
        }

        return result
    }

    async syncLocalSettingsToCloud(platform: PlatformService, toast: ToastrService) {
        const savedConfigs = this.readConfigFile(platform)
        if (savedConfigs) {
            await this.adapterHandler[savedConfigs.adapter].syncLocalSettingsToCloud(platform, toast).then(() => {})
        } else {
            toast.error(CloudSyncLang.trans('sync.error_invalid_setting_2'))
        }
    }

    readConfigFile(platform: PlatformService, isRaw = false) {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                const bytes = CryptoJS.AES.decrypt(fsReadFile(filePath, 'utf8').replace(CloudSyncLang.trans('common.config_inject_header'), ''), this.generatedCryptoHash)
                const content = (bytes.toString(CryptoJS.enc.Utf8))
                data = isRaw ? content : JSON.parse(content)
            } catch (e) {}
        }

        return data
    }

    readTabbyConfigFile(platform: PlatformService, isRaw = false, isEncrypt = false) {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                let content = fsReadFile(filePath, 'utf8')
                data = isRaw
                    ? (!isEncrypt ? content : (CloudSyncLang.trans('common.config_inject_header') + CryptoJS.AES.encrypt(content, this.generatedCryptoHash).toString()))
                    : JSON.parse(content)
            } catch (e) {}
        }

        return data
    }

    async toggleEnabledPlugin(value: boolean, platform: PlatformService, toast: ToastrService) {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        if (!fs.existsSync(filePath)) {
            toast.error(CloudSyncLang.trans('sync.need_to_save_config'))
            return false
        }
        const savedConfigs = this.readConfigFile(platform)
        savedConfigs.enabled = value
        const fileContent = JSON.stringify(savedConfigs)

        const promise = new Promise((resolve, reject) => {
            return fs.writeFile(filePath, fileContent,
                (err) => {
                    if (err) {
                        reject(false)
                    }

                    resolve(true)
                })
        })

        return await promise.then(status => {
            if (status) {
                toast.info(CloudSyncLang.trans(value ? 'sync.sync_enabled' : 'sync.sync_disabled'))
            } else {
                toast.info(CloudSyncLang.trans('sync.error_save_setting'))
            }
            return status
        })
    }

    async removeConfirmFile(platform: PlatformService, toast): Promise<boolean> {
        let result = false
        try {
            if ((await platform.showMessageBox({
                type: 'warning',
                message: CloudSyncLang.trans('sync.confirm_remove_setting'),
                buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.yes')],
                defaultId: 1,
            })).response === 1) {
                const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename)
                        toast.info(CloudSyncLang.trans('sync.remove_setting_success'))
                        return true
                    } catch (e) {
                        toast.error(CloudSyncLang.trans('sync.remove_setting_error'))
                    }
                }
            }
        } catch (error) {
            toast.error(CloudSyncLang.trans('sync.remove_setting_error'))
        }

        return result
    }

    doDescryption (content) {
        const bytes = CryptoJS.AES.decrypt(content.replace(CloudSyncLang.trans('common.config_inject_header'), ''), this.generatedCryptoHash)
        return (bytes.toString(CryptoJS.enc.Utf8))
    }
}
export default new SettingsHelperClass()
