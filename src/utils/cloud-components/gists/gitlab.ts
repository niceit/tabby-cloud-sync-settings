import {ConfigService, PlatformService} from "terminus-core";
import Logger from "../../Logger";
import axios from "axios";
import CloudSyncLang from "../../../data/lang";
import Gist from "../gist";
import CloudSyncSettingsData from "../../../data/setting-items";
import {ToastrService} from "ngx-toastr";
import {GistParams} from "../../../interface";
import SettingsHelper from "../../settings-helper";

let isSyncingInProgress = false
class Gitlab extends Gist {
    constructor(id: string, accessToken: string) {
        super(CloudSyncSettingsData.gistUrls.gitlab, id, accessToken);
    }

    testConnection = async (platform: PlatformService) : Promise<any> => {
        const logger = new Logger(platform)
        if (!this.id) {
            const createGist = await axios.post(this.baseRequestUrl, {
                title: "Tabby sync configs",
                files: [{
                    file_path: 'tabby-sync-settings.txt',
                    content: this.getDummyContent()
                }],
                description: this.getSyncTextDateTime(),
                visibility: 'private'
            }, {
                headers: {
                    'PRIVATE-TOKEN': `${this.accessToken}`
                }
            }).then((data) => {
                return {code: 1, data: data.data}
            }).catch((e) => {
                return {code: 0, message: e.toString()}
            })

            if (!createGist.code) {
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + CloudSyncLang.trans('gist.error_create_gist'), 'error')
                return {code: 0, message: createGist['message']}
            }
            this.id = createGist['data'].id
        }
        const url = `${this.baseRequestUrl}/${this.id}`;

        return await axios.get(url, {
            headers: {
                'PRIVATE-TOKEN': `${this.accessToken}`
            }}).then(data => {
            return {code: 1, data: data.data}
        }).catch(async e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return {code: 0, message: e.toString()}
        })
    }

    sync = async (config: ConfigService, platform: PlatformService, toast: ToastrService, params: GistParams, firstInit = false) => {
        const logger = new Logger(platform)
        let result = {result: false, message: ''}

        const url = `${this.baseRequestUrl}/${params.id}/raw`;
        const gistContent :{
            code: number,
            data: any,
            message: string
        } = await axios.get(url, {
            headers: {
                'PRIVATE-TOKEN': `${params.accessToken}`
            }}).then(data => {
            return {code: 1, data: data.data, message: ''}
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString(), data: null }
        })

        if (gistContent.code) {
            let serverTabbyContent = gistContent.data

            if (firstInit) {
                if ((await platform.showMessageBox({
                    type: 'warning',
                    message: CloudSyncLang.trans('sync.sync_confirmation'),
                    buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                    defaultId: 0,
                })).response === 1) {
                    result['result'] = await this.syncLocalSettingsToCloud(platform, toast)
                } else {
                    if (SettingsHelper.verifyServerConfigIsValid(serverTabbyContent)) {
                        await SettingsHelper.backupTabbyConfigFile(platform)
                        config.writeRaw(SettingsHelper.doDescryption(serverTabbyContent))
                        return true
                    } else {
                        result['result'] = false
                        result['message'] = CloudSyncLang.trans('common.errors.invalidServerConfig')
                    }
                }
            } else {
                config.writeRaw(SettingsHelper.doDescryption(serverTabbyContent))
                return true
            }
        } else {
            result['message'] = gistContent.message
        }

        return result
    }

    async syncLocalSettingsToCloud(platform: PlatformService, toast: ToastrService) {
        const logger = new Logger(platform)
        let result = false
        if (!isSyncingInProgress) {
            isSyncingInProgress = true

            const savedConfigs = SettingsHelper.readConfigFile(platform)
            const params = savedConfigs.configs as GistParams
            const localSettingContent = SettingsHelper.readTabbyConfigFile(platform, true, true)
            const component = new Gitlab(params.id, params.accessToken)

            result = await axios.put(`${component.baseRequestUrl}/${component.id}`, {
                gist_id: component.id,
                files: [{
                    file_path: 'tabby-sync-settings.txt',
                    content: localSettingContent,
                    action: 'update'
                }],
                description: this.getSyncTextDateTime()
            },{
                headers: {
                    'PRIVATE-TOKEN': `${component.accessToken}`
                }
            }).then(() => {
                toast.info(CloudSyncLang.trans('sync.sync_success'))
                return true
            }).catch(e => {
                logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
                if (isSyncingInProgress) {
                    toast.error(CloudSyncLang.trans('sync.sync_error'))
                }
                return false
            })


            isSyncingInProgress = false
        }

        return result
    }
}

export default Gitlab
