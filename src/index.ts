// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
import { ToastrService } from 'ngx-toastr'
import { CloudSyncAboutComponent } from './components/sub-components/about/about.component'
import { CloudSyncGistSettingsComponent } from './components/sub-components/gist/gist-settings.component'
import { CloudSyncFeedbackComponent } from './components/feeback-form/feeback.component'
import { MasterPasswordComponent } from './components/master-password/master-password.component'
import { ChangeLogsComponent } from './components/change-logs/change-logs.component'
import { SupportUsComponent } from './components/support-us/support-us.component'
import CloudSyncSettingsData from './data/setting-items';

let autoSynInProgress = false
let autoSynIntervalInstance = null
let initAutoSynIntervalFrequency = CloudSyncSettingsData.defaultSyncInterval * 1000

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        NgbModule,
    ],
    providers: [
        { provide: SettingsTabProvider, useClass: SyncConfigSettingsTabProvider, multi: true },
    ],
    entryComponents: [
        CloudSyncSettingsComponent,
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
        SupportUsComponent,
        ToggleComponent,
    ],
})


export default class CloudSyncSettingsModule {
    constructor (private app: AppService,
        private platform: PlatformService,
        private toast: ToastrService,
        private configService: ConfigService) {
        setTimeout(async () => {
            await this.syncCloudSettings().then(() => {
                setTimeout(() => {
                    this.subscribeToConfigChangeEvent()
                }, 2000)

                this.subscribeToAutoSyncEvent()
            })
        })
    }

    subscribeToAutoSyncEvent (): void {
        // Auto Sync between local and remote every 30s
        autoSynIntervalInstance = setTimeout(() => {
            this.syncCloudSettings().then()
        }, initAutoSynIntervalFrequency)
    }

    subscribeToConfigChangeEvent (): void {
        this.configService.changed$.subscribe(async () => {
            await SettingsHelper.syncLocalSettingsToCloud(this.platform, this.toast).then(() => { /* TODO document why this arrow function is empty */ })
        })
    }

    async syncCloudSettings (): Promise<void> {
        if (!autoSynInProgress) {
            autoSynInProgress = true
            const savedConfigs = SettingsHelper.readConfigFile(this.platform)
            if (savedConfigs?.enabled) {
                console.warn('Tabby Auto Sync Started ' + new Date().toLocaleString())
                initAutoSynIntervalFrequency = (savedConfigs?.interval_insync || CloudSyncSettingsData.defaultSyncInterval) * 1000
                await SettingsHelper.syncWithCloud(this.configService, this.platform, this.toast).then(() => {
                    autoSynInProgress = false
                    this.subscribeToAutoSyncEvent()
                })
            }
        } else {
            clearTimeout(autoSynIntervalInstance)
        }
    }
}
