import { NgModule } from '@angular/core'
import { SettingsTabProvider } from 'terminus-settings'
import { SyncConfigSettingsTabProvider } from './settings'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgbModule } from '@ng-bootstrap/ng-bootstrap'
import {AppService, ConfigProvider, ConfigService, PlatformService} from 'terminus-core'
import { SyncConfigProvider } from 'config'
import { CloudSyncSettingsComponent } from './components/cloud-sync-settings.component'
import { ToggleComponent } from 'components/toggle.component'
import { CloudSyncAmazonSettingsComponent } from './components/sub-components/amazon/amazon-settings.component'
import { CloudSyncBuiltinSettingsComponent } from './components/sub-components/built-in/builtin-settings.component'
import { CloudSyncWebDavSettingsComponent } from './components/sub-components/webdav/webdav-settings.component'
import { CloudSyncFtpSettingsComponent } from './components/sub-components/ftp/ftp-settings.component'
import SettingsHelper from './utils/settings-helper'
import {ToastrService} from "ngx-toastr";

@NgModule({
    imports: [
        CommonModule,
        FormsModule,
        NgbModule,
    ],
    providers: [
        { provide: SettingsTabProvider, useClass: SyncConfigSettingsTabProvider, multi: true },
        { provide: ConfigProvider, useClass: SyncConfigProvider, multi: true },
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
        ToggleComponent,
    ],
})

export default class CloudSyncSettingsModule {
    constructor (private app: AppService, private platform: PlatformService,
                 private toast: ToastrService,
                 private configService: ConfigService) {
        app.ready$.subscribe(async () => {
            await this.syncCloudSettings()
            configService.ready$.toPromise().then(() => {
                setTimeout(() => {
                    this.configService.changed$.subscribe(async () => {
                        await SettingsHelper.syncLocalSettingsToCloud(platform, toast)
                    })
                }, 2000)
            })
        })
    }

    async syncCloudSettings() {
        const savedConfigs = SettingsHelper.readConfigFile(this.platform)
        if (savedConfigs) {
            await SettingsHelper.syncWithCloud(this.configService, this.platform, this.toast).then(() => {})
        }
    }
}
