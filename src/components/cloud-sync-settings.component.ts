import { compare as semverCompare, valid as semverValid } from 'semver'
import { Component, HostBinding, OnInit } from '@angular/core'
import { ConfigService, PlatformService, BaseComponent } from 'terminus-core'
import CloudSyncSettingsData from '../data/setting-items'
import Lang from '../data/lang'
import SettingsHelper from '../utils/settings-helper'
import axios from 'axios'
import { version } from '../../package.json'
import devConstants from '../services/dev-constants'
import PluginToast from '../services/toast'
import Logger from '../utils/Logger'

/** @hidden */
@Component({
    template: require('./cloud-sync-settings.component.pug'),
    styles: [require('./cloud-sync-settings.component.scss')],
})

export class CloudSyncSettingsComponent extends BaseComponent implements OnInit {
    lastVersion = ''
    translate = Lang
    isUpdateAvailable = false
    updateAvailableMessage = ''
    isDebug = devConstants.ENABLE_DEBUG

    serviceProviderValues = CloudSyncSettingsData.values
    serviceProviders = CloudSyncSettingsData.serviceProvidersList
    selectedProvider = ''


    syncEnabled = false
    isShowSyncLoader = true
    intervalSync = CloudSyncSettingsData.defaultSyncInterval
    storedSettingsData = null
    form = CloudSyncSettingsData.formData
    hasCustomEncryptionSecret = false
    encryptionSecretLoaded = false
    encryptionSecret = ''
    encryptionSecretConfirmation = ''
    showEncryptionSecret = false
    showEncryptionSecretConfirmation = false
    recoverySnapshots: string[] = []

    @HostBinding('class.content-box') true
    constructor (
        public config: ConfigService,
        private platform: PlatformService
    ) {
        super()
    }

    async ngOnInit (): Promise<void> {
        this.checkForNewVersion().catch(() => { /* offline or API unreachable — ignore */ })
        await SettingsHelper.loadEncryptionSecret()
        this.hasCustomEncryptionSecret = SettingsHelper.hasCustomEncryptionSecret()
        this.encryptionSecretLoaded = true
        this.recoverySnapshots = SettingsHelper.listSnapshots(this.platform, 'snapshot')
        this.storedSettingsData = SettingsHelper.readConfigFile(this.platform)
        if (this.storedSettingsData) {
            this.selectedProvider = this.storedSettingsData.adapter
            this.syncEnabled = this.storedSettingsData.enabled
            this.isShowSyncLoader = !!this.storedSettingsData?.showLoader
            this.intervalSync = this.storedSettingsData?.interval_insync || CloudSyncSettingsData.defaultSyncInterval
        } else {
            this.selectedProvider = this.serviceProviderValues.S3
        }
    }

    /** Logs provider selection and safe Dropbox build diagnostics without exposing credentials. */
    onProviderChanged (provider: string): void {
        const dropboxForm = this.form[this.serviceProviderValues.DROPBOX]
        const appKey = typeof dropboxForm?.apiKey === 'string' ? dropboxForm.apiKey.trim() : ''

        new Logger(this.platform).log({
            event: 'cloud-sync-provider-selected',
            provider,
            pluginVersion: version,
            buildId: process.env.TABBY_CLOUD_SYNC_BUILD_ID || 'unknown',
            dropboxAppKeyPresent: appKey.length > 0,
            dropboxAppKeyLength: appKey.length,
        })
    }

    /**
     * Queries the npm registry for the latest published version and flags an update
     * as available when the installed version is older (semver comparison).
     */
    async checkForNewVersion (): Promise<void> {
        const response = await axios.get(CloudSyncSettingsData.external_urls.checkForUpdateUrl, {
            timeout: 30000,
        })
        const latestVersion = response.data?.['dist-tags']?.latest
        if (typeof latestVersion !== 'string' || !semverValid(latestVersion)) {
            throw new Error('npm registry returned an invalid latest version')
        }

        if (semverCompare(version, latestVersion) === -1) {
            this.isUpdateAvailable = true
            this.lastVersion = latestVersion
            this.updateAvailableMessage = Lang.trans('alerts.update_available', { version: latestVersion })
        }
    }

    async restoreRecoverySnapshot (snapshotPath: string): Promise<void> {
        const restored = await SettingsHelper.restoreSnapshot(this.platform, snapshotPath)
        if (restored) {
            PluginToast.success('Configuration snapshot restored. Restart Tabby to load it.')
            this.config.requestRestart()
        } else {
            PluginToast.error('The configuration snapshot could not be restored.')
        }
    }

    toggleEncryptionSecretVisibility (): void {
        this.showEncryptionSecret = !this.showEncryptionSecret
    }

    toggleEncryptionSecretConfirmationVisibility (): void {
        this.showEncryptionSecretConfirmation = !this.showEncryptionSecretConfirmation
    }

    async setCustomEncryptionSecret (): Promise<void> {
        if (this.hasCustomEncryptionSecret || SettingsHelper.hasCustomEncryptionSecret()) {
            PluginToast.error(this.translate.trans('settings.encryption_already_configured'))
            return
        }

        if (this.encryptionSecret !== this.encryptionSecretConfirmation) {
            PluginToast.error(this.translate.trans('settings.encryption_mismatch'))
            return
        }

        try {
            await SettingsHelper.setCustomEncryptionSecret(this.platform, this.encryptionSecret)
            this.hasCustomEncryptionSecret = true
            this.encryptionSecret = ''
            this.encryptionSecretConfirmation = ''
            this.showEncryptionSecret = false
            this.showEncryptionSecretConfirmation = false
            PluginToast.success(this.translate.trans('settings.encryption_saved'))
        } catch (error) {
            PluginToast.error(error.message || this.translate.trans('settings.encryption_failed'))
        }
    }

    /** Persists the enabled/disabled state of the sync plugin. */
    async toggleEnableSync(): Promise<void> {
        await SettingsHelper.toggleEnabledPlugin(this.syncEnabled, this.platform)
    }

    /** Persists whether the sync loader indicator should be shown. */
    async toggleEnableShowLoader(): Promise<void> {
        await SettingsHelper.toggleEnabledShowLoader(this.isShowSyncLoader, this.platform)
    }

    /** Saves the sync interval and requests an app restart when it changed successfully. */
    onIntervalSyncChanged (): void {
        SettingsHelper.saveIntervalSync(this.intervalSync, this.platform).then((result) => {
            if (result) {
                this.config.requestRestart()
            }
        })
    }
}
