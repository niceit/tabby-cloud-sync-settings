import { WebDavParams } from '../interface'
const devMockData = require('../data/mockdata.json')
export class DevMockDataClass {
    getWebDavMockData (): WebDavParams {
        return devMockData.webdav
    }
}

export default new DevMockDataClass()
