import { NgModule } from '@angular/core'
import { SettingsTabProvider } from 'terminus-settings'
import { SyncConfigSettingsTabProvider } from './settings'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { AppService, ConfigService, PlatformService } from 'terminus-core'
import { CloudSyncSettingsComponent } from './components/cloud-sync-settings.component'
import { ToggleComponent } from 'components/toggle.component'
import { CloudSyncAmazonSettingsComponent } from './components/sub-components/amazon/amazon-settings.component'
import { CloudSyncBuiltinSettingsComponent } from './components/sub-components/built-in/builtin-settings.component'
import { CloudSyncWebDavSettingsComponent } from './components/sub-components/webdav/webdav-settings.component'
import { CloudSyncFtpSettingsComponent } from './components/sub-components/ftp/ftp-settings.component'
import SettingsHelper from './utils/settings-helper'
import PluginToast from './services/toast'
import { CloudSyncAboutComponent } from './components/sub-components/about/about.component'
import { CloudSyncGistSettingsComponent } from './components/sub-components/gist/gist-settings.component'
import { CloudSyncFeedbackComponent } from './components/feeback-form/feeback.component'
import { MasterPasswordComponent } from './components/master-password/master-password.component'
import { ChangeLogsComponent } from './components/change-logs/change-logs.component'

import CloudSyncSettingsData from './data/setting-items'
import { CheckForUpdatesComponent } from './components/sub-components/check-for-updates/check-for-updates.component'
import { CloudSyncDropboxSettingsComponent } from './components/sub-components/dropbox/dropbox-settings.component'
import { DropboxEncryptionSecretModalComponent } from './components/sub-components/dropbox/dropbox-encryption-secret-modal.component'
import Logger from './utils/Logger'
import SyncLock from './utils/sync-lock'
import SyncState, { resolveBaselineKey } from './utils/sync-state'
import { getLocalConfigHash } from './utils/config-hash'
import { ToolbarButtonProvider } from 'terminus-core'
import { CloudSyncCommandProvider, CommandProvider } from './providers/cloud-sync-command.provider'
import { CloudSyncToolbarProvider } from './providers/cloud-sync-toolbar.provider'
import { CloudSyncActions } from './providers/cloud-sync-actions'

let autoSynIntervalInstance = null
let configChangeDebounceInstance = null
let initAutoSynIntervalFrequency = CloudSyncSettingsData.defaultSyncInterval * 1000
let consecutiveSyncFailures = 0
let syncPausedForConflict = false

/**
 * How long to wait after a config change before uploading. Tabby emits
 * `changed$` several times for one user action (and twice for a single
 * `writeRaw`), so the events are coalesced into one upload.
 */
const CONFIG_CHANGE_DEBOUNCE_MS = 1500

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        NgbModule,
    ],
    providers: [
        { provide: SettingsTabProvider, useClass: SyncConfigSettingsTabProvider, multi: true },
        CloudSyncActions,
        { provide: CommandProvider, useClass: CloudSyncCommandProvider, multi: true },
        { provide: ToolbarButtonProvider, useClass: CloudSyncToolbarProvider, multi: true },
    ],
    entryComponents: [
        CloudSyncSettingsComponent,
        DropboxEncryptionSecretModalComponent,
    ],
    declarations: [
        CloudSyncAmazonSettingsComponent,
        CloudSyncBuiltinSettingsComponent,
        CloudSyncWebDavSettingsComponent,
        CloudSyncFtpSettingsComponent,
        CloudSyncSettingsComponent,
        CloudSyncGistSettingsComponent,
        CloudSyncAboutComponent,
        CloudSyncFeedbackComponent,
        MasterPasswordComponent,
        ChangeLogsComponent,
        CheckForUpdatesComponent,
        ToggleComponent,
        CloudSyncDropboxSettingsComponent,
        DropboxEncryptionSecretModalComponent,
    ],
})

export default class CloudSyncSettingsModule {
    constructor (private app: AppService,
        private platform: PlatformService,
        private configService: ConfigService) {
        this.injectLoaderIndicator()
        SettingsHelper.loadEncryptionSecret().then(() => {
            return this.syncCloudSettings()
        }).then(() => {
            setTimeout(() => {
                this.subscribeToConfigChangeEvent()
            }, 2000)
        })
    }

    /**
     * Schedule the next auto-sync run after the configured interval, replacing
     * any run already pending so the loop can never fork into two timers.
     */
    subscribeToAutoSyncEvent (): void {
        if (autoSynIntervalInstance) {
            clearTimeout(autoSynIntervalInstance)
        }

        autoSynIntervalInstance = setTimeout(() => {
            this.syncCloudSettings()
        }, initAutoSynIntervalFrequency)
    }

    /**
     * Push local changes as soon as Tabby reports its config was modified.
     *
     * Tabby also emits `changed$` when *we* write a pulled config, so the local
     * hash is compared against the recorded sync baseline first. Without that
     * check every pull immediately triggered a push, which bumped the remote
     * timestamp, which made the next cycle pull again — the ping-pong users saw
     * as "syncing is not right".
     */
    subscribeToConfigChangeEvent (): void {
        this.configService.changed$.subscribe(() => {
            if (configChangeDebounceInstance) {
                clearTimeout(configChangeDebounceInstance)
            }

            configChangeDebounceInstance = setTimeout(() => {
                configChangeDebounceInstance = null
                this.pushLocalConfigChange()
            }, CONFIG_CHANGE_DEBOUNCE_MS)
        })
    }

    /** Upload the local config after a debounced change event, if it really changed. */
    private async pushLocalConfigChange (): Promise<void> {
        if (this.isTabbySyncActive() || syncPausedForConflict) {
            return
        }
        const logger = new Logger(this.platform)
        if (SyncLock.isLocked) {
            logger.log(`Config changed. But "${SyncLock.currentOwner}" is in progress. Skipping...`)
            return
        }

        if (this.isLocalConfigAlreadySynced()) {
            logger.log('Config changed event received, but the local config already matches the last synced content. Skipping...')
            return
        }

        logger.log('Config changed. Syncing local settings to cloud...')
        this.showLoaderIndicator()
        await SettingsHelper.syncLocalSettingsToCloud(this.platform).then(() => {
            this.hideLoaderIndicator()
        }).catch((err) => {
            this.hideLoaderIndicator()
            logger.log('Error while syncing local settings to cloud: ' + err.toString(), 'error')
            PluginToast.error(err.message || err.toString())
        })
    }

    /**
     * Whether the config on disk is equivalent to what was last synced, in which
     * case the change event was an echo of our own write rather than a real edit.
     */
    private isLocalConfigAlreadySynced (): boolean {
        const savedConfigs = SettingsHelper.readConfigFile(this.platform)
        const baselineKey = resolveBaselineKey(savedConfigs)
        if (!baselineKey) {
            return false
        }

        const baseline = SyncState.read(this.platform, baselineKey)
        if (!baseline?.hash) {
            return false
        }

        return baseline.hash === getLocalConfigHash(this.platform)
    }

    /**
     * Run one auto-sync cycle: pull/push with the cloud, then reschedule the
     * next run. The loop is always rescheduled (even on failure or when sync is
     * disabled) so a single error can no longer permanently stop auto-sync.
     *
     * Overlap is prevented by the shared {@link SyncLock} rather than a local
     * flag, so the settings UI and the config-change listener are serialised
     * against this loop too.
     */
    async syncCloudSettings (): Promise<void> {
        if (this.isTabbySyncActive() || syncPausedForConflict) {
            return
        }
        const logger = new Logger(this.platform)
        if (SyncLock.isLocked) {
            logger.log(`Skipping this auto sync cycle, "${SyncLock.currentOwner}" is still running.`)
            this.subscribeToAutoSyncEvent()
            return
        }

        const savedConfigs = SettingsHelper.readConfigFile(this.platform)
        if (!savedConfigs?.enabled) {
            logger.log('Tabby Auto Sync Disabled ' + new Date().toLocaleString())
            this.subscribeToAutoSyncEvent()
            return
        }

        if (savedConfigs?.showLoader) {
            this.showLoaderIndicator()
        }

        logger.log('Tabby Auto Sync Started ' + new Date().toLocaleString())
        initAutoSynIntervalFrequency = (savedConfigs?.interval_insync || CloudSyncSettingsData.defaultSyncInterval) * 1000

        try {
            const result = await SettingsHelper.syncWithCloud(this.configService, this.platform)
            const message = result?.message || ''
            if (message.toLowerCase().includes('sync conflict')) {
                syncPausedForConflict = true
                PluginToast.warning('Sync paused because local and cloud settings both changed. Resolve the preserved snapshots before resuming.')
            }
            if (result?.result) {
                consecutiveSyncFailures = 0
            } else {
                consecutiveSyncFailures++
            }
            logger.log('Tabby Auto Sync Completed ' + new Date().toLocaleString())
        } catch (err) {
            logger.log('Tabby Auto Sync Failed: ' + err.toString(), 'error')
        } finally {
            if (consecutiveSyncFailures >= 5) {
                initAutoSynIntervalFrequency = Math.min(initAutoSynIntervalFrequency * 2, 15 * 60 * 1000)
            }
            this.subscribeToAutoSyncEvent()
            setTimeout(() => {
                this.hideLoaderIndicator()
            }, 3000)
        }
    }

    private isTabbySyncActive (): boolean {
        const sync = this.configService?.store?.configSync
        return !!(sync?.host && sync?.token && sync?.configID)
    }

    /** Append the syncing loader element to the document body. */
    injectLoaderIndicator (): void {
        const loader = document.createElement('div')
        loader.classList.add('tabby-sync-loading')
        loader.setAttribute('role', 'status')
        loader.setAttribute('aria-label', 'Syncing settings')
        loader.innerHTML = `
            <svg class="loader" aria-hidden="true" focusable="false" viewBox="0 0 40 40">
                <circle class="loader__track" cx="20" cy="20" r="17"></circle>
                <circle class="loader__progress" cx="20" cy="20" r="17"></circle>
                <path class="loader__cloud" d="M26.5 25H15a3.5 3.5 0 0 1-.45-6.97 5.75 5.75 0 0 1 11.04-1.58A4.5 4.5 0 0 1 26.5 25Zm-11.5-5a1.5 1.5 0 1 0 0 3h11.5a2.5 2.5 0 0 0 .03-5 1 1 0 0 1-1.02-.78 3.75 3.75 0 0 0-7.33 1.07 1 1 0 0 1-1.15.85A1.5 1.5 0 0 0 15 20Z"></path>
            </svg>`
        document.body.appendChild(loader)
    }

    /** Show the syncing loader indicator, if present. */
    showLoaderIndicator (): void {
        document.querySelector('.tabby-sync-loading')?.classList.add('active')
    }

    /** Hide the syncing loader indicator, if present. */
    hideLoaderIndicator (): void {
        document.querySelector('.tabby-sync-loading')?.classList.remove('active')
    }
}
