import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../data/setting-items'
import { PlatformService } from 'terminus-core'

@Component({
    selector: 'change-logs-cloud-sync',
    template: require('./change-logs.component.pug'),
    styles: [require('./change-logs.component.scss')],
})
export class ChangeLogsComponent implements OnInit {
    constructor (private platform: PlatformService) {
        // do nothing
    }
    ngOnInit (): void {
        // do nothing
    }

    openPluginPage (): void {
        this.platform.openExternal(CloudSyncSettingsData.pluginUrl)
    }
}
