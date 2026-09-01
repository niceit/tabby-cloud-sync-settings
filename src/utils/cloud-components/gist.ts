import { ConfigService, PlatformService } from 'terminus-core'
import PluginToast from '../../services/toast'
import axios from 'axios'
import moment from 'moment'
import Logger from '../Logger'
import CloudSyncLang from '../../data/lang'
import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import { GistParams, SyncResult } from '../../interface'
import { hashConfigContent } from '../config-hash'
import { applyRemoteConfigOnFirstInit, recordLocalBaselineOnFirstInit, resolveSyncDirection } from './sync-utils'

/**
 * Base class shared by the "files map" style Gist providers (GitHub, Gitee).
 *
 * Both providers store one or more named files inside a single gist and expose
 * almost identical sync flows; the only differences are the auth headers and
 * the connection-test request, which subclasses override.
 */
class Gist {
    protected baseRequestUrl: string
    protected id: string
    protected accessToken: string

    constructor (url: string, id: string, accessToken: string) {
        this.baseRequestUrl = url
        this.id = id
        this.accessToken = accessToken
    }

    /**
     * Key under which this provider's sync baseline is stored.
     *
     * All gist flavours share the single stored adapter id (`gists`), so the
     * gist type is appended: switching from GitHub to GitLab keeps the same
     * adapter and would otherwise inherit the other provider's baseline.
     */
    protected getAdapterId (): string {
        return CloudSyncSettingsData.values.GIST + ':' + this.getGistType()
    }

    /** Short provider discriminator used to key the baseline. */
    protected getGistType (): string {
        return 'gist'
    }

    /** A dated description used when writing gist revisions. */
    getSyncTextDateTime (): string {
        return 'Tabby sync config ' + new Date().toLocaleString()
    }

    /** Placeholder content used when creating an empty gist. */
    getDummyContent (): string {
        return 'tabby config will sync here.'
    }

    /** HTTP headers used to authenticate gist requests. Overridden per provider. */
    protected getAuthHeaders (): any {
        return { Authorization: `Bearer ${this.accessToken}` }
    }

    /** Fetch the raw gist payload, returning `{ code, data, message }`. */
    protected async fetchGist (url: string, logger: Logger): Promise<{ code: number, data: any, message: string }> {
        return axios.get(url, { headers: this.getAuthHeaders() }).then(response => {
            return { code: 1, data: response.data, message: '' }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, data: null, message: e.toString() }
        })
    }

    /** Extract the file map and the first file's content from a gist payload. */
    private extractFiles (data: any): { gistFiles: any, serverTabbyContent: string } {
        const gistFiles = {}
        let serverTabbyContent = ''
        for (const idx in data.files) {
            gistFiles[idx] = data.files[idx].content
            if (!serverTabbyContent) {
                serverTabbyContent = data.files[idx].content
            }
        }

        return { gistFiles, serverTabbyContent }
    }

    /**
     * Two-way sync between the local Tabby config and a gist.
     *
     * @param firstInit When `true` prompts the user to choose the initial sync
     *  direction. Otherwise {@link resolveSyncDirection} compares content
     *  hashes against the recorded baseline to decide.
     */
    sync = async (config: ConfigService, platform: PlatformService, params: GistParams, firstInit = false): Promise<SyncResult> => {
        const logger = new Logger(platform)
        const result: SyncResult = { result: false, message: '' }
        const gistContent = await this.fetchGist(`${this.baseRequestUrl}/${params.id}`, logger)

        if (!gistContent.code) {
            result.message = gistContent.message
            return result
        }

        // `updated_at` is ISO-8601 with a `Z` offset, so it parses to the
        // correct absolute instant with no timezone conversion needed.
        const remoteSyncConfigUpdatedAt = gistContent.data?.updated_at ? moment(gistContent.data.updated_at) : null
        const { gistFiles, serverTabbyContent } = this.extractFiles(gistContent.data)

        if (firstInit) {
            if ((await platform.showMessageBox({
                type: 'warning',
                message: CloudSyncLang.trans('sync.sync_confirmation'),
                buttons: [CloudSyncLang.trans('buttons.sync_from_cloud'), CloudSyncLang.trans('buttons.sync_from_local')],
                defaultId: 0,
            })).response === 1) {
                result.result = await this.uploadLocalSettings(platform, gistFiles, serverTabbyContent)
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
                pushToCloud: () => this.uploadLocalSettings(platform, gistFiles, serverTabbyContent),
            })
            result.result = outcome.result
            result.message = outcome.message
        }

        return result
    }

    /** Human readable provider name used in log output. Overridden per provider. */
    protected getProviderLabel (): string {
        return 'Gist'
    }

    /** Build a new instance of the concrete provider. Overridden per provider. */
    protected createComponent (id: string, accessToken: string): Gist {
        return new Gist(this.baseRequestUrl, id, accessToken)
    }

    /**
     * Push the local Tabby config to every file inside the gist.
     *
     * The `description` field is bumped on every write, and GitHub/Gitee treat
     * that as a revision, so `updated_at` moves even when the content is
     * unchanged. That is why the upload is skipped when the gist already holds
     * this exact config: otherwise the remote timestamp would keep advancing and
     * every device would believe the cloud had newer settings.
     *
     * @param gistFiles Known file map to overwrite; fetched from the server
     *  when not provided (e.g. a forced upload from the UI).
     * @param remoteContent Content already known to be on the server, used to
     *  skip a pointless write. Fetched alongside `gistFiles` when omitted.
     */
    protected async uploadLocalSettings (platform: PlatformService, gistFiles: any = null, remoteContent: string = null): Promise<boolean> {
        const logger = new Logger(platform)
        const savedConfigs = SettingsHelper.readConfigFile(platform)
        const params = savedConfigs.configs as GistParams
        const localSettingContent = SettingsHelper.readTabbyConfigFile(platform, true, true)
        const component = this.createComponent(params.id, params.accessToken)

        if (!gistFiles) {
            const gistContent = await this.fetchGist(`${this.baseRequestUrl}/${params.id}`, logger)
            if (!gistContent.code) {
                PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
                return false
            }

            const extracted = this.extractFiles(gistContent.data)
            gistFiles = extracted.gistFiles
            remoteContent = extracted.serverTabbyContent
        }

        if (this.isRemoteUpToDate(remoteContent, localSettingContent)) {
            logger.log('Gist already holds this config, skipping the upload to keep its timestamp stable.')
            return true
        }

        const gitFileParams = {}
        for (const idx in gistFiles) {
            gitFileParams[idx] = { content: localSettingContent }
        }

        return axios.patch(`${component.baseRequestUrl}/${component.id}`, {
            gist_id: component.id,
            files: gitFileParams,
            description: this.getSyncTextDateTime(),
        }, {
            headers: {
                Accept: 'application/vnd.github.v3+json',
                ...component.getAuthHeaders(),
            },
        }).then(() => {
            logger.log(CloudSyncLang.trans('sync.sync_success'))
            return true
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_upload_settings') + ' | Exception: ' + e.toString(), 'error')
            PluginToast.error(CloudSyncLang.trans('sync.sync_error'))
            return false
        })
    }

    /**
     * Whether the remote copy already contains the config we are about to
     * upload.
     *
     * Both sides are decrypted first: `CryptoJS.AES.encrypt` salts every call,
     * so the ciphertext of identical input differs and comparing the encrypted
     * payloads would always report a change.
     */
    protected isRemoteUpToDate (remoteContent: string, localContent: string): boolean {
        if (!remoteContent || !SettingsHelper.verifyServerConfigIsValid(remoteContent)) {
            return false
        }

        return hashConfigContent(SettingsHelper.doDescryption(remoteContent)) === hashConfigContent(SettingsHelper.doDescryption(localContent))
    }

    /**
     * Force-push the local Tabby config to the gist.
     *
     * Concurrency is handled by the shared lock in `SettingsHelper`, so there is
     * no adapter-local re-entrancy flag here any more; the old per-adapter flags
     * could silently turn a scheduled push into a no-op that still reported
     * success.
     */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<boolean> {
        return this.uploadLocalSettings(platform)
    }
}

export default Gist
