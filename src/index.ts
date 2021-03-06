import { NgModule } from '@angular/core'
import { SettingsTabProvider } from 'terminus-settings'
import { SyncConfigSettingsTabProvider } from './settings'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import { AppService, ConfigProvider, ConfigService, PlatformService } from 'terminus-core'
import { CloudSyncSettingsComponent } from './components/cloud-sync-settings.component'
import { ToggleComponent } from 'components/toggle.component'
import { CloudSyncAmazonSettingsComponent } from './components/sub-components/amazon/amazon-settings.component'
import { CloudSyncBuiltinSettingsComponent } from './components/sub-components/built-in/builtin-settings.component'
import { CloudSyncWebDavSettingsComponent } from './components/sub-components/webdav/webdav-settings.component'
import { CloudSyncFtpSettingsComponent } from './components/sub-components/ftp/ftp-settings.component'
import SettingsHelper from './utils/settings-helper'
import { ToastrService } from "ngx-toastr";
import { CloudSyncAboutComponent } from "./components/sub-components/about/about.component";
import {CloudSyncGistSettingsComponent} from "./components/sub-components/gist/gist-settings.component";
let autoSynInProgress = false;
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

                // Auto Sync between local and remote every 30s
                setInterval(() => {
                    console.warn("Tabby Auto Sync Started");
                    this.syncCloudSettings();
                }, 30000)
            })
        })
    }

    subscribeToConfigChangeEvent() {
        this.configService.changed$.subscribe(async () => {
            await SettingsHelper.syncLocalSettingsToCloud(this.platform, this.toast).then(() => {})
        })
    }

    async syncCloudSettings() {
        if (!autoSynInProgress) {
            autoSynInProgress = true;
            const savedConfigs = SettingsHelper.readConfigFile(this.platform)
            if (savedConfigs) {
                await SettingsHelper.syncWithCloud(this.configService, this.platform, this.toast).then(() => {
                    autoSynInProgress = false;
                })
            }
        }
    }
}
