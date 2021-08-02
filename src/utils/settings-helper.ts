import {fsReadFile} from "ts-loader/dist/utils";
import {PlatformService} from "terminus-core";
import CloudSyncSettingsData from "../data/setting-items";

const fs = require('fs')
const path = require('path');
export class SettingsHelperClass {
    async saveSettingsToFile (platform: PlatformService, adapter: string, params: any ): Promise<any> {
        const settingsArr = {
            adapter: adapter,
            configs: params,
        }
        const fileContent = JSON.stringify(settingsArr)
        try {
            const promise = new Promise((resolve, reject) => {
                return fs.writeFile(path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename, fileContent,
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

    readConfigFile(platform: PlatformService) {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                let content = fsReadFile(filePath, 'utf8')
                data = JSON.parse(content)
            } catch (e) {}
        }

        return data
    }
}
export default new SettingsHelperClass()
