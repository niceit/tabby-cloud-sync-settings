// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, OnInit } from '@angular/core'
import { ConfigService, PlatformService } from 'terminus-core'
import { version } from '../../../../package.json'
import axios from 'axios'
import { compare as semverCompare } from 'semver'
import { TabbySyncUpgradeService } from '../../../services/tabby-sync-upgrade'
import CloudSyncSettingsData from '../../../data/setting-items'

@Component({
    selector: 'check-for-updates-cloud-sync',
    template: require('./check-for-updates.component.pug'),
    styles: [require('./check-for-updates.component.scss')],
})
export class CheckForUpdatesComponent implements OnInit {
    version = version
    errorCheckForUpdates = false

    isSuccessPluginUpgrade = false
    errorUpgradePlugin = false
    errorUpgradePluginMessage = ''
    isUpdatingPlugin = false

    isUpdateAvailable = false
    newVersionData = null

    noUpdateAvailable = false
    isProcessingRequest = false

    constructor (private platform: PlatformService,
        private config: ConfigService,
        public pluginManager: TabbySyncUpgradeService) {
    }

    ngOnInit (): void {
        // do nothing
    }

    async checkForPluginVersion (): Promise<void> {
        this.isProcessingRequest = true
        this.errorCheckForUpdates = false
        this.isUpdateAvailable = false
        this.newVersionData = null
        this.noUpdateAvailable = false

        this.isSuccessPluginUpgrade = false
        this.errorUpgradePlugin = false
        this.errorUpgradePluginMessage = ''
        this.isUpdatingPlugin = false

        await axios.get(CloudSyncSettingsData.external_urls.checkForUpdateUrl, {
            timeout: 30000,
        }).then((response) => {
            this.newVersionData = response.data
            if (semverCompare(version, this.newVersionData.version) === -1) {
                this.isUpdateAvailable = true
            } else {
                this.noUpdateAvailable = true
            }
            this.isProcessingRequest = false
        }).catch(() => {
            this.isProcessingRequest = false
            this.errorCheckForUpdates = true
        })
    }

    async upgradePlugin (): Promise<void> {
        this.isUpdatingPlugin = true
        try {
            await this.pluginManager.installPlugin(this.newVersionData.version)
            this.isUpdatingPlugin = false
            this.config.requestRestart()
            this.isSuccessPluginUpgrade = true
        } catch (err) {
            this.errorUpgradePlugin = true
            this.errorUpgradePluginMessage = err.message
            this.isUpdatingPlugin = false
        }
    }
}
