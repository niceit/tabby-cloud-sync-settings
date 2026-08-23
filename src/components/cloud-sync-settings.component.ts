import { compare as semverCompare, valid as semverValid } from 'semver'
import { Component, HostBinding, OnInit } from '@angular/core'
import { ConfigService, PlatformService, BaseComponent } from 'terminus-core'
import CloudSyncSettingsData from '../data/setting-items'
import Lang from '../data/lang'
import SettingsHelper from '../utils/settings-helper'
import axios from 'axios'
import { version } from '../../package.json'
import devConstants from '../services/dev-constants'
import { ConnectionGroup } from '../interface'

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

    groups: ConnectionGroup[] = [
        {
            name: 'Exclusive Sponsor Cloud Services',
            collapsed: true,
            type: 'exclusive',
        },
        {
            name: 'Free Cloud Services',
            collapsed: false,
            type: 'free',
        },
    ]

    syncEnabled = false
    isShowSyncLoader = true
    intervalSync = CloudSyncSettingsData.defaultSyncInterval
    storedSettingsData = null
    form = CloudSyncSettingsData.formData

    @HostBinding('class.content-box') true
    constructor (
        public config: ConfigService,
        private platform: PlatformService
    ) {
        super()
    }

    ngOnInit (): void {
        this.checkForNewVersion().catch(() => { /* offline or API unreachable — ignore */ })
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
