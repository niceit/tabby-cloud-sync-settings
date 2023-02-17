import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../data/setting-items'
import { PlatformService } from 'terminus-core'
import axios from 'axios'

@Component({
    selector: 'support-us-cloud-sync',
    template: require('./support-us.component.pug'),
    styles: [require('./support-us.component.scss')],
})
export class SupportUsComponent implements OnInit {
    isSponsorListVisible = false
    isLoadingSponsorList = false
    loadSponsorListError = false
    sponsorList = []

    constructor (private platform: PlatformService) {
        // do nothing
    }
    ngOnInit (): void {
        // do nothing
    }

    openDonationPage (): void {
        this.platform.openExternal(CloudSyncSettingsData.donationUrl)
    }

    async toggleSponsorList (): Promise<void> {
        this.isSponsorListVisible = !this.isSponsorListVisible
        await this.loadSponsorList()
    }

    async loadSponsorList (): Promise<void> {
        this.loadSponsorListError = false
        this.isLoadingSponsorList = true
        await axios.get(CloudSyncSettingsData.external_urls.ApiUrl + '/sponsors', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        }).then((data) => {
            this.sponsorList = data.data
            this.isLoadingSponsorList = false
        }).catch(() => {
            this.isLoadingSponsorList = false
            this.loadSponsorListError = true
        })
    }
}
