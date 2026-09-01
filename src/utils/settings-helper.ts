import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncSettingsData from '../data/setting-items'
import PluginToast from '../services/toast'
import WebDav from './cloud-components/WebDav'
import CloudSyncLang from '../data/lang'
import AmazonS3 from './cloud-components/AmazonS3'
import FTP from './cloud-components/FTP'
import Gists from './cloud-components/gists/gists'
import DropboxSync from './cloud-components/Dropbox'
import { StoredSettings } from '../interface'
import { EventEmitter } from '@angular/core'
import Logger from './Logger'
import SyncLock from './sync-lock'
import SyncState, { resolveBaselineKey } from './sync-state'
import { getLocalConfigHash } from './config-hash'
import SettingsSecret from './settings-secret'
import { decryptPayload, encryptV1, encryptV2, isV2Payload } from './settings-crypto'

const fs = require('fs')
const path = require('path')
const CryptoJS = require('crypto-js')

export class SettingsHelperClass {
    /**
     * Maps a stored provider identifier to the adapter instance that knows how
     * to talk to that cloud service.
     */
    private adapterHandler = {
        [CloudSyncSettingsData.values.WEBDAV]: WebDav,
        [CloudSyncSettingsData.values.S3]: AmazonS3,
        [CloudSyncSettingsData.values.WASABI]: AmazonS3,
        [CloudSyncSettingsData.values.DIGITAL_OCEAN]: AmazonS3,
        [CloudSyncSettingsData.values.BLACKBLAZE]: AmazonS3,
        [CloudSyncSettingsData.values.S3_COMPATIBLE]: AmazonS3,
        [CloudSyncSettingsData.values.FTP]: FTP,
        [CloudSyncSettingsData.values.GIST]: Gists,
        [CloudSyncSettingsData.values.DROPBOX]: DropboxSync,
    }



    /**
     * Absolute path of the encrypted plugin settings file (stored next to the
     * Tabby config directory).
     */
    private getStoredSettingsPath (platform: PlatformService): string {
        return path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.storedSettingsFilename
    }

    /**
     * Encrypt an arbitrary payload (usually the stored settings object) with
     * the plugin header prefix so it can be recognised later.
     */
    private encryptPayload (payload: any): string {
        const raw = typeof payload === 'string' ? payload : JSON.stringify(payload)
        const secret = SettingsSecret.get()
        const encrypted = secret ? encryptV2(raw, secret) : encryptV1(raw)
        return CloudSyncLang.trans('common.config_inject_header') + encrypted
    }

    /**
     * Promise wrapper around `fs.writeFile` that resolves to `true` on success
     * and `false` on failure. Centralising this fixes the historical bug where
     * the write callback rejected without returning, so `resolve(true)` still
     * ran after an error.
     */
    private writeFileAsync (filePath: string, content: string): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            fs.writeFile(filePath, content, (err) => {
                resolve(!err)
            })
        })
    }

    /**
     * Encrypt `payload` and persist it to `filePath`. Returns `true` when the
     * file was written successfully.
     */
    private async writeEncryptedConfig (filePath: string, payload: any): Promise<boolean> {
        try {
            return await this.writeFileAsync(filePath, this.encryptPayload(payload))
        } catch (e) {
            return false
        }
    }

    /**
     * Persist the provider configuration to disk. Existing enable/loader/
     * interval preferences are preserved when a settings file already exists.
     */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    async saveSettingsToFile (platform: PlatformService, adapter: string, params: any): Promise<boolean> {
        const filePath = this.getStoredSettingsPath(platform)
        const settingsArr: StoredSettings = {
            adapter: adapter,
            enabled: true,
            showLoader: true,
            interval_insync: CloudSyncSettingsData.defaultSyncInterval,
            configs: params,
        }

        if (fs.existsSync(filePath)) {
            const savedConfigs = this.readConfigFile(platform)
            if (savedConfigs) {
                settingsArr.enabled = savedConfigs.enabled
                settingsArr.showLoader = savedConfigs.showLoader
                settingsArr.interval_insync = savedConfigs.interval_insync

                // Pointing the plugin at a different provider (or a different
                // gist flavour on the same one) invalidates the recorded
                // baseline, so force the next cycle to re-establish it.
                if (resolveBaselineKey(savedConfigs) !== resolveBaselineKey(settingsArr)) {
                    SyncState.clearAdapter(platform, savedConfigs.adapter)
                }
            }
        }

        return this.writeEncryptedConfig(filePath, settingsArr)
    }

    /**
     * Encrypt the current local Tabby config and write it to the temporary
     * upload file used by the FTP adapter.
     */
    async generateEncryptedTabbyFileForUpload (platform: PlatformService): Promise<boolean> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbyLocalEncryptedFile
        try {
            const tabbyConfig = this.readTabbyConfigFile(platform, true, true)
            return await this.writeFileAsync(filePath, tabbyConfig)
        } catch (e) {
            return false
        }
    }

    /**
     * Run the two-way sync for the currently configured adapter.
     *
     * Wrapped in the shared {@link SyncLock} so the periodic loop, the
     * config-change listener and the settings UI can never overlap. When the
     * lock is unavailable the call reports failure with an explanatory message
     * instead of silently doing nothing.
     *
     * @param firstInit When `true` the adapter prompts the user to choose the
     *  initial sync direction (cloud → local or local → cloud).
     * @returns `{ result, message }` describing whether the sync succeeded.
     */
    async syncWithCloud (config: ConfigService, platform: PlatformService, firstInit = false, emitter: EventEmitter<any> = null): Promise<any> {
        const savedConfigs = this.readConfigFile(platform)
        const logger = new Logger(platform)

        if (!savedConfigs || !savedConfigs.enabled) {
            logger.log('Sync disabled or config missing. Skipping...')
            return { result: false, message: '' }
        }

        const adapter = this.adapterHandler[savedConfigs.adapter]
        if (!adapter) {
            logger.log('No adapter found for provider: ' + savedConfigs.adapter, 'error')
            return { result: false, message: '' }
        }

        if (CloudSyncSettingsData.isCloudStorageS3Compatibility(savedConfigs.adapter)) {
            AmazonS3.setProvider(savedConfigs.adapter)
        }

        return SyncLock.runExclusive('syncWithCloud', async () => {
            try {
                return await adapter.sync(config, platform, savedConfigs.configs, firstInit, emitter)
            } catch (e) {
                logger.log('Sync failed: ' + e.toString(), 'error')
                PluginToast.error(e.toString())
                return { result: false, message: e.toString() }
            }
        }, { result: false, message: 'A sync is already in progress.' })
    }

    /**
     * Force-push the local Tabby config to the cloud using the saved adapter.
     *
     * Shares the same lock as {@link syncWithCloud}; when a cycle is already
     * running the push is skipped rather than racing it.
     */
    async syncLocalSettingsToCloud (platform: PlatformService): Promise<void> {
        const savedConfigs = this.readConfigFile(platform)
        if (!savedConfigs || !this.adapterHandler[savedConfigs.adapter]) {
            PluginToast.error(CloudSyncLang.trans('sync.error_invalid_setting_2'))
            return
        }

        const logger = new Logger(platform)
        await SyncLock.runExclusive('syncLocalSettingsToCloud', async () => {
            const pushed = await this.adapterHandler[savedConfigs.adapter].syncLocalSettingsToCloud(platform)
            const ok = typeof pushed === 'boolean' ? pushed : !!pushed?.result
            if (ok) {
                // Both sides now hold this content, so record it as the baseline
                // to stop the next cycle from treating the upload as a change.
                SyncState.record(platform, resolveBaselineKey(savedConfigs), getLocalConfigHash(platform))
            }
            return null
        }, null).catch((err) => {
            logger.log('Forced upload failed: ' + err.toString(), 'error')
            PluginToast.error(err.toString())
        })
    }

    /**
     * Read and decrypt the stored plugin settings file.
     *
     * @param isRaw When `true` returns the decrypted string instead of a parsed
     *  object.
     * @returns The parsed {@link StoredSettings}, the raw string, or `null`
     *  when the file is missing or cannot be decrypted.
     */
    readConfigFile (platform: PlatformService, isRaw = false): any {
        let data = null
        const filePath = this.getStoredSettingsPath(platform)
        if (fs.existsSync(filePath)) {
            try {
                const encrypted = fs.readFileSync(filePath, 'utf8').replace(CloudSyncLang.trans('common.config_inject_header'), '')
                const content = decryptPayload(encrypted, SettingsSecret.get() || '')
                data = isRaw ? content : JSON.parse(content)
            } catch (e) {
                // Corrupted or unreadable settings file - treat as no config.
            }
        }

        return data
    }

    /**
     * Read the local Tabby `config.yaml`.
     *
     * @param isRaw When `true` returns the file content as a string.
     * @param isEncrypt When `true` (and `isRaw` is set) returns the encrypted,
     *  header-prefixed content ready to upload to the cloud.
     */
    readTabbyConfigFile (platform: PlatformService, isRaw = false, isEncrypt = false): any {
        let data = null
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8')
                data = isRaw
                    ? !isEncrypt ? content : this.encryptPayload(content)
                    : JSON.parse(content)
            } catch (e) {
                // Ignore read/parse errors and fall back to null.
            }
        }

        return data
    }

    /**
     * Create a `.backup` copy of the local Tabby config before it is
     * overwritten by a cloud pull.
     */
    async backupTabbyConfigFile (platform: PlatformService): Promise<boolean> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        if (!fs.existsSync(filePath)) {
            return false
        }

        try {
            const content = fs.readFileSync(filePath, 'utf8')
            const backupFilePath = filePath + '.backup'
            return await this.writeFileAsync(backupFilePath, content)
        } catch (e) {
            return false
        }
    }

    /**
     * Overwrite the local Tabby `config.yaml` with plain (already decrypted)
     * YAML content.
     *
     * Used before handing the same content to `ConfigService.writeRaw`, which
     * kicks off a `save()` and a `load()` concurrently without awaiting either.
     * If the `load()` wins the race it reads the *old* file and reverts Tabby's
     * in-memory store, silently undoing the pull. Writing the file first makes
     * both orderings produce the same result.
     */
    async writeTabbyConfigFile (platform: PlatformService, content: string): Promise<boolean> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        return this.writeFileAsync(filePath, content)
    }

    /**
     * Save the cloud version of the config next to the local one when both sides
     * changed, so a conflict never destroys data.
     *
     * @returns The path written, or `null` when the write failed.
     */
    async writeConflictSnapshot (platform: PlatformService, content: string): Promise<string> {
        return this.writeSnapshot(platform, content, 'conflict')
    }

    /**
     * Write a timestamped recovery snapshot and retain only the newest entries.
     * The existing `config.yaml.backup` file is intentionally left untouched.
     */
    async writeSnapshot (platform: PlatformService, content: string, kind = 'snapshot', retention = 10): Promise<string> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        const timestamp = Date.now()
        let snapshotPath = filePath + '.' + kind + '-' + timestamp
        let suffix = 1
        while (fs.existsSync(snapshotPath)) {
            snapshotPath = filePath + '.' + kind + '-' + timestamp + '-' + suffix
            suffix++
        }
        const written = await this.writeFileAsync(snapshotPath, content)
        if (!written) {
            return null
        }
        this.pruneSnapshots(platform, kind, retention)
        return snapshotPath
    }

    /** List newest-to-oldest timestamped snapshots for the local config. */
    listSnapshots (platform: PlatformService, kind = 'snapshot'): string[] {
        const directory = path.dirname(platform.getConfigPath())
        const baseName = path.basename(CloudSyncSettingsData.tabbySettingsFilename)
        try {
            return fs.readdirSync(directory)
                .filter((name) => name.indexOf(baseName + '.' + kind + '-') === 0)
                .map((name) => path.join(directory, name))
                .sort((left, right) => right.localeCompare(left))
        } catch (e) {
            return []
        }
    }

    /** Restore a selected snapshot into `config.yaml`, preserving `.backup`. */
    async restoreSnapshot (platform: PlatformService, snapshotPath: string): Promise<boolean> {
        const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
        const resolved = path.resolve(snapshotPath)
        if (path.dirname(resolved) !== path.dirname(path.resolve(filePath)) || !fs.existsSync(resolved)) {
            return false
        }
        try {
            await this.backupTabbyConfigFile(platform)
            return await this.writeTabbyConfigFile(platform, fs.readFileSync(resolved, 'utf8'))
        } catch (e) {
            return false
        }
    }

    private pruneSnapshots (platform: PlatformService, kind: string, retention: number): void {
        const snapshots = this.listSnapshots(platform, kind)
        for (const oldSnapshot of snapshots.slice(Math.max(0, retention))) {
            try {
                fs.unlinkSync(oldSnapshot)
            } catch (e) {
                // Best-effort cleanup; a retained snapshot is safer than a failed sync.
            }
        }
    }

    /**
     * Patch one or more fields of the stored settings file and persist it,
     * surfacing a success/error toast. Shared by the interval and toggle
     * setters.
     */
    private async updateSavedConfig (patch: Partial<StoredSettings>, platform: PlatformService, successMessage: string): Promise<boolean> {
        const filePath = this.getStoredSettingsPath(platform)
        if (!fs.existsSync(filePath)) {
            PluginToast.error(CloudSyncLang.trans('sync.need_to_save_config'))
            return false
        }

        const savedConfigs = this.readConfigFile(platform)
        if (!savedConfigs) {
            PluginToast.error(CloudSyncLang.trans('sync.error_save_setting'))
            return false
        }

        Object.assign(savedConfigs, patch)
        const status = await this.writeEncryptedConfig(filePath, savedConfigs)
        if (status) {
            PluginToast.success(successMessage)
        } else {
            PluginToast.error(CloudSyncLang.trans('sync.error_save_setting'))
        }
        return status
    }

    /** Persist the auto-sync interval (in seconds). */
    async saveIntervalSync (value: number, platform: PlatformService): Promise<boolean> {
        return this.updateSavedConfig({ interval_insync: value }, platform, CloudSyncLang.trans('sync.setting_changes_saved'))
    }

    /** Enable or disable the auto-sync feature. */
    async toggleEnabledPlugin (value: boolean, platform: PlatformService): Promise<boolean> {
        return this.updateSavedConfig({ enabled: value }, platform, CloudSyncLang.trans(value ? 'sync.sync_enabled' : 'sync.sync_disabled'))
    }

    /** Show or hide the syncing loader indicator. */
    async toggleEnabledShowLoader (value: boolean, platform: PlatformService): Promise<boolean> {
        return this.updateSavedConfig({ showLoader: value }, platform, CloudSyncLang.trans(value ? 'sync.loader_enabled' : 'sync.loader_disabled'))
    }

    /**
     * Remove the saved plugin settings file, optionally prompting the user for
     * confirmation first.
     */
    async removeConfirmFile (platform: PlatformService, needConfirm = true, showSuccess = true): Promise<boolean> {
        let result = false
        try {
            if (needConfirm) {
                if ((await platform.showMessageBox({
                    type: 'warning',
                    message: CloudSyncLang.trans('sync.confirm_remove_setting'),
                    buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.yes')],
                    defaultId: 1,
                })).response === 1) {
                    result = this._removeSavedConfig(platform)
                }
            } else {
                result = this._removeSavedConfig(platform)
            }

            if (result) {
                const secretCleared = await this.clearCustomEncryptionSecret()
                this.removeDisconnectedProviderArtifacts(platform)
                if (secretCleared && showSuccess) {
                    PluginToast.success(CloudSyncLang.trans('sync.remove_setting_success'))
                } else if (!secretCleared) {
                    PluginToast.error(CloudSyncLang.trans('sync.remove_secret_error'))
                }
            }
        } catch (error) {
            PluginToast.error(CloudSyncLang.trans('sync.remove_setting_error'))
        }

        return result
    }

    /** Delete the stored settings file from disk. */
    _removeSavedConfig (platform: PlatformService): boolean {
        const filePath = this.getStoredSettingsPath(platform)
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath)
                // The baseline describes a provider that is no longer configured,
                // so drop it too; otherwise a re-configured provider would
                // inherit a stale "last synced" hash.
                SyncState.clear(platform)
                return true
            } catch (e) {
                PluginToast.error(CloudSyncLang.trans('sync.remove_setting_error'))
            }
        }

        return false
    }

    /** Remove local encrypted artifacts that belong to the disconnected provider. */
    private removeDisconnectedProviderArtifacts (platform: PlatformService): void {
        const configDirectory = path.dirname(platform.getConfigPath())
        const artifactPaths = [
            this.getStoredSettingsPath(platform) + '.v1-backup',
            configDirectory + CloudSyncSettingsData.tabbyLocalEncryptedFile,
        ]

        for (const artifactPath of artifactPaths) {
            try {
                if (fs.existsSync(artifactPath)) {
                    fs.unlinkSync(artifactPath)
                }
            } catch (_) { }
        }
    }

    /** Return the encrypted payload after removing the plugin file header. */
    private getEncryptedPayload (content: string): string {
        return content.replace(CloudSyncLang.trans('common.config_inject_header'), '')
    }

    /** Decrypt a header-prefixed cloud config string back to plain text. */
    doDescryption (content: string): string {
        if (!content) {
            return ''
        }

        return decryptPayload(this.getEncryptedPayload(content), SettingsSecret.get() || '')
    }

    /** Detect whether a downloaded plugin config uses the authenticated V2 envelope. */
    isV2EncryptedConfig (content: string): boolean {
        return !!content && this.verifyServerConfigIsValid(content) && isV2Payload(this.getEncryptedPayload(content))
    }

    /** Return whether the current keychain secret can decrypt this config. */
    canDecryptConfig (content: string): boolean {
        try {
            return this.doDescryption(content).length > 0
        } catch (_) {
            return false
        }
    }

    /** Verify a candidate secret without storing it or modifying local configuration. */
    verifyCustomEncryptionSecret (content: string, secret: string): boolean {
        if (!secret || !this.isV2EncryptedConfig(content)) {
            return false
        }

        try {
            return decryptPayload(this.getEncryptedPayload(content), secret).length > 0
        } catch (_) {
            return false
        }
    }

    /** Verify and persist the secret needed to unlock an existing remote V2 config. */
    async unlockCustomEncryptionSecret (platform: PlatformService, content: string, secret: string): Promise<boolean> {
        if (!this.verifyCustomEncryptionSecret(content, secret)) {
            throw new Error(CloudSyncLang.trans('dropbox.encryption_secret_invalid'))
        }

        return this.setCustomEncryptionSecret(platform, secret)
    }

    /** Check whether a downloaded config was produced by this plugin. */
    verifyServerConfigIsValid (configRawData: string): boolean {
        return !!configRawData && configRawData.includes(CloudSyncLang.trans('common.verifyConfigString'))
    }

    /** Clear the persisted `lastErrorMessage` for the given adapter config. */
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    clearLastErrorMessage (platform: PlatformService, adapter: string, params: any): void {
        params.lastErrorMessage = ''
        this.saveSettingsToFile(platform, adapter, params)
    }

    /**
     * Fetch remote plugin settings (currently the Dropbox API credentials) on
     * startup and merge them into the in-memory form data.
     */
    async loadEncryptionSecret (): Promise<void> {
        await SettingsSecret.load()
    }

    hasCustomEncryptionSecret (): boolean {
        return SettingsSecret.hasSecret()
    }

    async setCustomEncryptionSecret (platform: PlatformService, secret: string): Promise<boolean> {
        if (SettingsSecret.hasSecret()) {
            throw new Error('A custom encryption secret is already active and cannot be replaced.')
        }

        const filePath = this.getStoredSettingsPath(platform)
        const legacyContent = fs.existsSync(filePath) ? this.readConfigFile(platform, true) : null
        await SettingsSecret.set(secret)

        if (legacyContent) {
            const backupPath = filePath + '.v1-backup'
            try {
                if (!fs.existsSync(backupPath)) {
                    fs.copyFileSync(filePath, backupPath)
                }
                const settings = JSON.parse(legacyContent)
                if (!await this.writeEncryptedConfig(filePath, settings)) {
                    throw new Error('The existing settings could not be migrated.')
                }
                if (!this.readConfigFile(platform)) {
                    throw new Error('The migrated settings could not be read back.')
                }
            } catch (error) {
                try {
                    fs.copyFileSync(backupPath, filePath)
                } catch (_) { }
                await SettingsSecret.clear()
                throw error
            }
        }

        return true
    }

    async clearCustomEncryptionSecret (): Promise<boolean> {
        return SettingsSecret.clear()
    }

}

export default new SettingsHelperClass()
