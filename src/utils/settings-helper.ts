const fs = require('fs')
const resolve = require('path').resolve
export class SettingsHelperClass {

    settingPathFile = resolve('./tabby-cloud-sync-settings') + '/settings.json'
    async saveSettingsToFile (adapter: string, params: any ): Promise<any> {
        console.log('file path', this.settingPathFile)
        const settingsArr = {
            adapter: adapter,
            configs: params,
        }
        const fileContent = JSON.stringify(settingsArr)

        try {
            const promise = new Promise((resolve, reject) => {
                return fs.writeFile(this.settingPathFile, fileContent, (err) => {
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
}
export default new SettingsHelperClass()
