import { Component, OnInit } from '@angular/core'
import { ConfigService, PlatformService } from 'terminus-core'
import { version } from '../../../../package.json'
import axios from 'axios'
import { compare as semverCompare, valid as semverValid } from 'semver'
import { TabbySyncUpgradeService } from '../../../services/tabby-sync-upgrade'
import CloudSyncSettingsData from '../../../data/setting-items'
import CloudSyncLang from '../../../data/lang'
import Logger from '../../../utils/Logger'
import PluginToast from '../../../services/toast'

@Component({
    selector: 'check-for-updates-cloud-sync',
    template: require('./check-for-updates.component.pug'),
    styles: [require('./check-for-updates.component.scss')],
})
export class CheckForUpdatesComponent implements OnInit {
    logger = null
    translate = CloudSyncLang
    version = version
    currentVersionMessage = CloudSyncLang.trans('updates.current_version', { version })
    latestVersionMessage = ''
    updateButtonLabel = ''
    availableRollbackBuilds = CloudSyncSettingsData.availablePluginVersions
    errorCheckForUpdates = false

    isSuccessPluginUpgrade = false
    isUpdatingPlugin = false
    targetRollbackVersion = ''

    isUpdateAvailable = false
    newVersionData = null

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

        this.isSuccessPluginUpgrade = false
        this.isUpdatingPlugin = false

        await axios.get(CloudSyncSettingsData.external_urls.checkForUpdateUrl, {
            timeout: 30000,
        }).then((response) => {
            const latestVersion = response.data?.['dist-tags']?.latest
            if (typeof latestVersion !== 'string' || !semverValid(latestVersion)) {
                throw new Error('npm registry returned an invalid latest version')
            }

            this.newVersionData = {
                version: latestVersion,
                what_news: [],
            }
            if (semverCompare(version, latestVersion) === -1) {
                this.isUpdateAvailable = true
                this.latestVersionMessage = CloudSyncLang.trans('updates.latest_version', { version: latestVersion })
                this.updateButtonLabel = CloudSyncLang.trans('buttons.update_to', { version: latestVersion })
            } else {
                PluginToast.success(CloudSyncLang.trans('updates.up_to_date'))
            }
            this.isProcessingRequest = false
        }).catch(() => {
            this.isProcessingRequest = false
            this.errorCheckForUpdates = true
            PluginToast.warning(CloudSyncLang.trans('updates.check_failed'))
        })
    }

    /**
     * Install the given plugin version (or the latest available one) and
     * request an app restart. Note that `requestRestart` typically tears down
     * the app, so any state set after it may not be observed.
     */
    async upgradePlugin (targetVersion = null): Promise<void> {
        const version = targetVersion || this.newVersionData.version
        this.isUpdatingPlugin = true
        this.logger.log('Updating plugin to version ' + version)
        try {
            await this.pluginManager.installPlugin(version)
            this.isUpdatingPlugin = false
            this.isSuccessPluginUpgrade = true
            this.logger.log('Plugin updated successfully to version ' + version)
            PluginToast.success(CloudSyncLang.trans('updates.upgrade_success'))
            this.config.requestRestart()
        } catch (err) {
            this.isUpdatingPlugin = false
            this.logger.log('Error while updating plugin to version ' + version + ': ' + err.message, 'error')
            PluginToast.error(err.message)
        }
    }

    async confirmRollbackToVersion (rollbackVersion: string): Promise<void> {
        this.targetRollbackVersion = rollbackVersion
        if ((await this.platform.showMessageBox({
            type: 'warning',
            message: CloudSyncLang.trans('updates.confirm_rollback', { version: rollbackVersion }),
            buttons: [CloudSyncLang.trans('buttons.ok'), CloudSyncLang.trans('buttons.cancel')],
            defaultId: 0,
        })).response === 0) {
            this.logger.log('Perform Rolling back to version ' + rollbackVersion)
            await this.upgradePlugin(rollbackVersion)
        } else {
            // do nothing
        }
    }
}
