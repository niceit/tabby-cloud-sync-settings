import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../data/setting-items'
import { PlatformService } from 'terminus-core'

@Component({
    selector: 'support-us-cloud-sync',
    template: require('./support-us.component.pug'),
    styles: [require('./support-us.component.scss')],
})
export class SupportUsComponent implements OnInit {
    constructor (private platform: PlatformService) {
    }
    ngOnInit (): void {
        // do nothing
    }

    openDonationPage (): void {
        this.platform.openExternal(CloudSyncSettingsData.donationUrl)
    }
}
