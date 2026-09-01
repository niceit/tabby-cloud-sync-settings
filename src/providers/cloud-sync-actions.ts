import { Injectable } from '@angular/core'
import { AppService, ConfigService, PlatformService } from 'terminus-core'
import PluginToast from '../services/toast'
import CloudSyncLang from '../data/lang'
import SettingsHelper from '../utils/settings-helper'
import SyncLock from '../utils/sync-lock'

export type CloudSyncStatus = 'unconfigured' | 'disabled' | 'ready' | 'syncing' | 'conflict'

@Injectable()
export class CloudSyncActions {
    constructor (
        private app: AppService,
        private config: ConfigService,
        private platform: PlatformService,
    ) { }

    get isTabbySyncActive (): boolean {
        const sync = this.config?.store?.configSync
        return !!(sync?.host && sync?.token && sync?.configID)
    }

    get status (): CloudSyncStatus {
        if (this.isTabbySyncActive) {
            return 'conflict'
        }
        if (SyncLock.isLocked) {
            return 'syncing'
        }

        const settings = SettingsHelper.readConfigFile(this.platform)
        if (!settings) {
            return 'unconfigured'
        }
        return settings.enabled ? 'ready' : 'disabled'
    }

    private refuseWhenTabbySyncIsActive (): boolean {
        if (!this.isTabbySyncActive) {
            return false
        }
        PluginToast.warning('Tabby Sync is enabled. Disable it before using Cloud Sync Settings to avoid configuration conflicts.')
        return true
    }

    async syncNow (): Promise<void> {
        if (this.refuseWhenTabbySyncIsActive()) {
            return
        }
        if (SyncLock.isLocked) {
            PluginToast.warning(`Sync is already in progress (${SyncLock.currentOwner}).`)
            return
        }

        const result = await SettingsHelper.syncWithCloud(this.config, this.platform)
        if (result?.result) {
            PluginToast.success(CloudSyncLang.trans('sync.sync_success'))
        } else {
            PluginToast.error(result?.message || CloudSyncLang.trans('sync.sync_error'))
        }
    }

    async uploadLocalSettings (): Promise<void> {
        if (this.refuseWhenTabbySyncIsActive()) {
            return
        }
        if (SyncLock.isLocked) {
            PluginToast.warning(`Sync is already in progress (${SyncLock.currentOwner}).`)
            return
        }

        await SettingsHelper.syncLocalSettingsToCloud(this.platform)
        if (!SyncLock.isLocked) {
            PluginToast.success('Local settings uploaded to the cloud.')
        }
    }

    async downloadCloudSettings (): Promise<void> {
        await this.syncNow()
    }

    openSettings (): void {
        try {
            const { SettingsTabComponent } = window['nodeRequire']('tabby-settings')
            const settingsTab = this.app.tabs.find(tab => tab instanceof SettingsTabComponent) as any
            if (settingsTab) {
                settingsTab.activeTab = 'cloud-settings-sync'
                this.app.selectTab(settingsTab)
            } else {
                // The plugin's pinned terminus-core types still expose the old
                // signature, while current Tabby expects a NewTabParameters object.
                ;(this.app.openNewTabRaw as any)({
                    type: SettingsTabComponent,
                    inputs: { activeTab: 'cloud-settings-sync' },
                })
            }
        } catch (err) {
            PluginToast.error('Could not open Cloud Sync Settings.')
        }
    }
}
