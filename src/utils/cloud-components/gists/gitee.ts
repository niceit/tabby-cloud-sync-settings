// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { ConfigService, PlatformService } from 'terminus-core'
import Logger from '../../Logger'
import axios from 'axios'
import CloudSyncLang from '../../../data/lang'
import Gist from '../gist'
import CloudSyncSettingsData from '../../../data/setting-items'
import { ToastrService } from 'ngx-toastr'
import { GistParams } from '../../../interface'
import SettingsHelper from '../../settings-helper'

let isSyncingInProgress = false
class Gitee extends Gist {
    constructor (id: string, accessToken: string) {
        super(CloudSyncSettingsData.gistUrls.gitee, id, accessToken)
    }

    testConnection = async (platform: PlatformService): Promise<any> => {
        const logger = new Logger(platform)
        if (!this.id) {
            const createGist = await axios.post(this.baseRequestUrl, {
                files: { 'tabby-sync-settings': { content: this.getDummyContent() } },
                description: this.getSyncTextDateTime(),
                'public': false,
                access_token: this.accessToken,
                id: '',
            }).then((data) => {
                return { code: 1, data: data.data }
            }).catch(() => {
                return { code: 0 }
            })

            if (!createGist.code) {
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + CloudSyncLang.trans('gist.error_create_gist'), 'error')
                return { code: 0, message: CloudSyncLang.trans('gist.error_create_gist') }
            }
            this.id = createGist['data'].id
        }
        const url = `${this.baseRequestUrl}/${this.id}`

        return axios.patch(url, {
            access_token: this.accessToken,
            id: this.id,
        }).then(data => {
            return { code: 1, data: data.data }
        }).catch(async e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString() }
        })
    }

    sync = async (config: ConfigService, platform: PlatformService, toast: ToastrService, params: GistParams, firstInit = false): Promise<any> => {
        const logger = new Logger(platform)
        let result = false

        const url = `${this.baseRequestUrl}/${params.id}`
        const gistContent = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${params.accessToken}`,
            } }).then(data => {
            return { code: 1, data: data.data }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString() }
        })

        if (gistContent.code) {
            const gistFiles = {}
            let serverTabbyContent = ''
            for (const idx in gistContent['data']['files']) {
                gistFiles[idx] = gistContent['data']['files'][idx].content
                if (!serverTabbyContent) {
                    serverTabbyContent = gistContent['data']['files'][idx].content
                }
            }

            if (firstInit) {
                if ((await platform.showMessageBox({
                    type: 'warning',
                    message: CloudSyncLang.trans('sync.sync_confirmation'),
                    buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                    defaultId: 0,
                })).response === 1) {
                    result = await this.syncLocalSettingsToCloud(platform, toast, gistFiles)
                } else {
                    config.writeRaw(SettingsHelper.doDescryption(serverTabbyContent))
                }
            } else {
                config.writeRaw(SettingsHelper.doDescryption(serverTabbyContent))
            }
        } else {
            result = false
        }

        return result
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async syncLocalSettingsToCloud (platform: PlatformService, toast: ToastrService, gistFiles: any): Promise<any> {
        const logger = new Logger(platform)
        let result = false
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs as GistParams
            const localSettingContent = SettingsHelper.readTabbyConfigFile(platform, true, true)
            const component = new Gitee(params.id, params.accessToken)

            if (!gistFiles) {
                const url = `${this.baseRequestUrl}/${params.id}`
                const gistContent = await axios.get(url, {
                    headers: {
                        Authorization: `Bearer ${params.accessToken}`,
                    } }).then(data => {
                    return { code: 1, data: data.data }
                }).catch(e => {
                    logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                    return { code: 0, message: e.toString() }
                })

                if (gistContent.code) {
                    gistFiles = {}
                    for (const idx in gistContent['data']['files']) {
                        gistFiles[idx] = gistContent['data']['files'][idx].content
                    }
                }
            }

            if (gistFiles) {
                const gitFileParams = {}
                for (const idx in gistFiles) {
                    gitFileParams[idx] = {
                        content: localSettingContent,
                    }
                }

                result = await axios.patch(`${component.baseRequestUrl}/${component.id}`, {
                    gist_id: component.id,
                    files: gitFileParams,
                    description: this.getSyncTextDateTime(),
                }, {
                    headers: {
                        Accept: 'application/vnd.github.v3+json',
                        Authorization: `Bearer ${component.accessToken}`,
                    },
                }).then(() => {
                    logger.log(CloudSyncLang.trans('sync.sync_success'))
                    return true
                }).catch(e => {
                    logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                    if (isSyncingInProgress) {
                        toast.error(CloudSyncLang.trans('sync.sync_error'))
                    }
                    return false
                })
            } else {
                result = false
            }

            isSyncingInProgress = false
        }

        return result
    }
}

export default Gitee
