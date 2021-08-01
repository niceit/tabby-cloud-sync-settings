const fs = require('fs')
const resolve = require('path').resolve
export class SettingsHelperClass {

    settingPathFile = resolve('./tabby-cloud-sync') + '/settings.json'
    async saveSettingsToFile (adapter: string, params: any ): Promise<any> {
        const settingsArr = {
            adapter: adapter,
            configs: params,
        }

        const settingFile = this.settingPathFile
        const fileContent = JSON.stringify(settingsArr)

        const promise = new Promise((resolve, reject) => {
            return fs.writeFile(settingFile, fileContent, (err) => {
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
}
export default new SettingsHelperClass()
