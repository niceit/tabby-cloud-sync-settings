import { Injectable } from '@angular/core'
import { CloudSyncSettingsComponent } from 'components/CloudSyncSettings.component'
import { SettingsTabProvider } from 'terminus-settings'
@Injectable()
export class SyncConfigSettingsTabProvider extends SettingsTabProvider {
    id = 'cloud-settings-sync'
    icon = 'cogs'
    title = 'Cloud Settings'

    getComponentType (): any {
        return CloudSyncSettingsComponent
    }
}
