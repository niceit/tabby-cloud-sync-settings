import {fsReadFile} from "ts-loader/dist/utils"
import {ConfigService, PlatformService} from "terminus-core"
import CloudSyncSettingsData from "../data/setting-items"
import {Toast, ToastrService} from "ngx-toastr";
import WebDav from "./cloud-components/WebDav";

const fs = require('fs')
const path = require('path');
export class SettingsHelperClass {
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
        const fileContent = JSON.stringify(settingsArr)

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

    async syncWithCloud (config: ConfigService, platform: PlatformService, toast: ToastrService, firstInit = false) {
        const savedConfigs = this.readConfigFile(platform)
        let result = false

        switch (savedConfigs.adapter) {
            case CloudSyncSettingsData.values.WEBDAV: {
                await WebDav.sync(config, platform, toast, savedConfigs.configs, firstInit).then(status => {
                    result = status
                })
                break
            }
        }

        return result
    }

    async syncLocalSettingsToCloud(platform: PlatformService, toast: ToastrService) {
        const savedConfigs = this.readConfigFile(platform)
        if (savedConfigs) {
            switch (savedConfigs.adapter) {
                case CloudSyncSettingsData.values.WEBDAV: {
                    await WebDav.syncLocalSettingsToCloud(platform).then(() => {
                        toast.info('Settings is synced.')
                    })
                    break
                }
            }
        } else {
            toast.error('Your sync config is invalid. Please re-configure it!')
        }
    }

    readConfigFile(platform: PlatformService, isRaw = false) {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                let content = fsReadFile(filePath, 'utf8')
                data = isRaw ? content : JSON.parse(content)
            } catch (e) {}
        }

        return data
    }

    readTabbyConfigFile(platform: PlatformService, isRaw = false) {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                let content = fsReadFile(filePath, 'utf8')
                data = isRaw ? content : JSON.parse(content)
            } catch (e) {}
        }

        return data
    }

    async toggleEnabledPlugin(value: boolean, platform: PlatformService, toast: ToastrService) {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        if (!fs.existsSync(filePath)) {
            toast.error('Please save your config first')
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
            return status
        })
    }

    async removeConfirmFile(platform: PlatformService, toast): Promise<boolean> {
        let result = false
        try {
            if ((await platform.showMessageBox({
                type: 'warning',
                message: 'Are you sure want to remove saved config?',
                buttons: ['Cancel', 'Yes'],
                defaultId: 1,
            })).response === 1) {
                const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
                if (fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename)
                        toast.info('Your settings had been removed.')
                        return true
                    } catch (e) {
                        toast.info('Can not remove your setting. Try again later!')
                    }
                }
            }
        } catch (error) {
            toast.info('Can not remove your setting. Try again later!')
        }

        return result
    }
}
export default new SettingsHelperClass()
