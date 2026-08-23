import { ConfigService, PlatformService } from 'terminus-core'
import axios from 'axios'
import moment from 'moment'
import Logger from '../../Logger'
import CloudSyncLang from '../../../data/lang'
import Gist from '../gist'
import CloudSyncSettingsData from '../../../data/setting-items'
import PluginToast from '../../../services/toast'
import { GistParams, SyncResult } from '../../../interface'
import SettingsHelper from '../../settings-helper'
import { applyRemoteConfigOnFirstInit, recordLocalBaselineOnFirstInit, resolveSyncDirection } from '../sync-utils'

/**
 * GitLab snippet provider. Unlike GitHub/Gitee this stores a single raw text
 * snippet, so it overrides the file-map based sync from {@link Gist}.
 */
class Gitlab extends Gist {
    constructor (id: string, accessToken: string) {
        super(CloudSyncSettingsData.gistUrls.gitlab, id, accessToken)
    }

    protected getProviderLabel (): string {
        return 'GitLab Gist'
    }

    protected getGistType (): string {
        return 'gitlab'
    }

    protected getAuthHeaders (): any {
        return { 'PRIVATE-TOKEN': `${this.accessToken}` }
    }

    /**
     * Verify the token, creating a new snippet when no id is configured.
     *
     * @return `{ code: 1, data }` on success or `{ code: 0, message }`.
     */
    testConnection = async (platform: PlatformService): Promise<any> => {
        const logger = new Logger(platform)
        if (!this.id) {
            const createGist = await axios.post(this.baseRequestUrl, {
                title: 'Tabby sync configs',
                files: [{
                    file_path: Gitlab.SNIPPET_FILE_PATH,
                    content: this.getDummyContent(),
                }],
                description: this.getSyncTextDateTime(),
                visibility: 'private',
            }, {
                headers: this.getAuthHeaders(),
            }).then((data) => {
                return { code: 1, data: data.data }
            }).catch((e) => {
                return { code: 0, message: e.toString() }
            })

            if (!createGist.code) {
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + CloudSyncLang.trans('gist.error_create_gist'), 'error')
                return { code: 0, message: createGist['message'] }
            }
            this.id = createGist['data'].id
        }

        return axios.get(`${this.baseRequestUrl}/${this.id}`, {
            headers: this.getAuthHeaders(),
        }).then(data => {
            return { code: 1, data: data.data }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString() }
        })
    }

    /** Name of the single file held inside the snippet. */
    private static readonly SNIPPET_FILE_PATH = 'tabby-sync-settings.txt'

    /**
     * Two-way sync between the local Tabby config and a GitLab snippet.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction. Otherwise {@link resolveSyncDirection} compares content
     *  hashes against the recorded baseline to decide.
     */
    sync = async (config: ConfigService, platform: PlatformService, params: GistParams, firstInit = false): Promise<SyncResult> => {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const headers = { 'PRIVATE-TOKEN': `${params.accessToken}` }
        let remoteSyncConfigUpdatedAt: moment.Moment = null

        await axios.get(`${this.baseRequestUrl}/${params.id}`, { headers }).then(data => {
            if (data.data?.updated_at) {
                // ISO-8601 with a `Z` offset, so this is already the correct
                // absolute instant; no timezone conversion is needed.
                remoteSyncConfigUpdatedAt = moment(data.data.updated_at)
            }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
        })

        const gistContent = await axios.get(`${this.baseRequestUrl}/${params.id}/raw`, { headers }).then(data => {
            return { code: 1, data: data.data, message: '' }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, data: null, message: e.toString() }
        })

        if (!gistContent.code) {
            result.message = gistContent.message
            return result
        }

        // A snippet holding only text is returned as a string, but axios parses
        // a JSON-looking body into an object, which would break every string
        // operation downstream.
        const serverTabbyContent = typeof gistContent.data === 'string' ? gistContent.data : JSON.stringify(gistContent.data)

        if (firstInit) {
            if ((await platform.showMessageBox({
                type: 'warning',
                message: CloudSyncLang.trans('sync.sync_confirmation'),
                buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                defaultId: 0,
            })).response === 1) {
                result.result = await this.uploadLocalSettings(platform, null, serverTabbyContent)
                if (result.result) {
                    recordLocalBaselineOnFirstInit(platform, this.getAdapterId())
                }
            } else if (SettingsHelper.verifyServerConfigIsValid(serverTabbyContent)) {
                await applyRemoteConfigOnFirstInit(config, platform, this.getAdapterId(), serverTabbyContent)
                result.result = true
            } else {
                result.result = false
                result.message = CloudSyncLang.trans('common.errors.invalidServerConfig')
            }
        } else {
            const outcome = await resolveSyncDirection({
                config,
                platform,
                logger,
                providerLabel: this.getProviderLabel(),
                adapterId: this.getAdapterId(),
                remoteUpdatedAt: remoteSyncConfigUpdatedAt,
                remoteContent: serverTabbyContent,
                pushToCloud: () => this.uploadLocalSettings(platform, null, serverTabbyContent),
            })
            result.result = outcome.result
            result.message = outcome.message
        }

        return result
    }

    /**
     * Overwrite the snippet with the local config.
     *
     * As with GitHub, `description` is bumped on every write and GitLab moves
     * `updated_at` accordingly, so an unchanged config is deliberately not
     * re-uploaded; otherwise the snippet would look permanently newer than
     * every device's local copy.
     *
     * @param _gistFiles Unused here (GitLab stores a single file), accepted only
     *  to keep the signature compatible with {@link Gist}.
     * @param remoteContent Content already known to be on the server, fetched
     *  when omitted so a forced upload from the UI can still skip a no-op write.
     */
    protected async uploadLocalSettings (platform: PlatformService, _gistFiles: any = null, remoteContent: string = null): Promise<boolean> {
        const logger = new Logger(platform)
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        const params = savedConfigs.configs as GistParams
        const localSettingContent = SettingsHelper.readTabbyConfigFile(platform, true, true)
        const component = new Gitlab(params.id, params.accessToken)

        if (remoteContent === null) {
            remoteContent = await axios.get(`${component.baseRequestUrl}/${component.id}/raw`, {
                headers: component.getAuthHeaders(),
            }).then(data => typeof data.data === 'string' ? data.data : JSON.stringify(data.data)).catch(() => null)
        }

        if (this.isRemoteUpToDate(remoteContent, localSettingContent)) {
            logger.log('GitLab snippet already holds this config, skipping the upload to keep its timestamp stable.')
            return true
        }

        return axios.put(`${component.baseRequestUrl}/${component.id}`, {
            gist_id: component.id,
            files: [{
                file_path: Gitlab.SNIPPET_FILE_PATH,
                content: localSettingContent,
                action: 'update',
            }],
            description: this.getSyncTextDateTime(),
        }, {
            headers: component.getAuthHeaders(),
        }).then(() => {
            logger.log(CloudSyncLang.trans('sync.sync_success'))
            return true
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
            return false
        })
    }
}

export default Gitlab
