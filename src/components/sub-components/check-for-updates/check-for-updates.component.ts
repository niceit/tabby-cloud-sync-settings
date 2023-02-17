// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, OnInit } from '@angular/core'
import { ConfigService, PlatformService } from 'terminus-core'
import { version } from '../../../../package.json'
import axios from 'axios'
import { compare as semverCompare } from 'semver'
import { TabbySyncUpgradeService } from '../../../services/tabby-sync-upgrade'
import CloudSyncSettingsData from '../../../data/setting-items'
import Logger from '../../../utils/Logger'

@Component({
    selector: 'check-for-updates-cloud-sync',
    template: require('./check-for-updates.component.pug'),
    styles: [require('./check-for-updates.component.scss')],
})
export class CheckForUpdatesComponent implements OnInit {
    logger = null
    version = version
    availableRollbackBuilds = CloudSyncSettingsData.availablePluginVersions
    errorCheckForUpdates = false

    isSuccessPluginUpgrade = false
    errorUpgradePlugin = false
    errorUpgradePluginMessage = ''
    isUpdatingPlugin = false
    targetRollbackVersion = ''

    isUpdateAvailable = false
    newVersionData = null

    noUpdateAvailable = false
    isProcessingRequest = false

    constructor (private platform: PlatformService,
        private config: ConfigService,
        public pluginManager: TabbySyncUpgradeService) {
        this.logger = new Logger(this.platform)
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

    async upgradePlugin (targetVersion = null): Promise<void> {
        this.isUpdatingPlugin = true
        this.logger.log('Updating plugin to version ' + (targetVersion ? targetVersion : this.newVersionData.version))
        try {
            await this.pluginManager.installPlugin(targetVersion ? targetVersion : this.newVersionData.version)
            this.isUpdatingPlugin = false
            this.config.requestRestart()
            this.isSuccessPluginUpgrade = true
            this.logger.log('Plugin updated successfully to version ' + (targetVersion ? targetVersion : this.newVersionData.version))
        } catch (err) {
            this.errorUpgradePlugin = true
            this.errorUpgradePluginMessage = err.message
            this.isUpdatingPlugin = false
            this.logger.log('Error while updating plugin to version ' + (targetVersion ? targetVersion : this.newVersionData.version) + ': ' + err.message, 'error')
        }
    }

    async confirmRollbackToVersion (rollbackVersion: string): Promise<void> {
        this.targetRollbackVersion = rollbackVersion
        if ((await this.platform.showMessageBox({
            type: 'warning',
            message: 'Are you sure you want to rollback to version ' + rollbackVersion + '?',
            buttons: ['Ok', 'Cancel'],
            defaultId: 0,
        })).response === 0) {
            this.logger.log('Perform Rolling back to version ' + rollbackVersion)
            await this.upgradePlugin(rollbackVersion)
        } else {
            // do nothing
        }
    }
}
