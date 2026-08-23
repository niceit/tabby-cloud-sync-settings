import { Component, OnInit } from '@angular/core'
import { PlatformService } from 'terminus-core'
import axios from 'axios'
import CloudSyncSettingsData from '../../../data/setting-items'

@Component({
    selector: 'cloud-sync-about',
    template: require('./cloud-sync-about.component.pug'),
    styles: [require('./cloud-sync-about.component.scss')],
})
export class CloudSyncAboutComponent implements OnInit {
    info = {
        author: '',
        support_url: '',
        github_url: '',
        buy_me_a_cafe: 'Buy me a coffee',
        version: '',
    }

    supportUrl = CloudSyncSettingsData.pluginUrl
    githubUrl = ''

    constructor (private platform: PlatformService) {
        // do nothing
    }

    ngOnInit (): void {
        this.loadPackageMetadata().catch(() => { /* offline or API unreachable — keep the view usable */ })
    }

    async loadPackageMetadata (): Promise<void> {
        const response = await axios.get(CloudSyncSettingsData.external_urls.checkForUpdateUrl, {
            timeout: 30000,
        })
        const packageMetadata = response.data
        const latestVersion = packageMetadata?.['dist-tags']?.latest
        const latestMetadata = packageMetadata?.versions?.[latestVersion]

        if (!latestMetadata || typeof latestVersion !== 'string') {
            throw new Error('npm registry returned invalid package metadata')
        }

        const author = typeof latestMetadata.author === 'string'
            ? latestMetadata.author
            : latestMetadata.author?.name || ''
        const repositoryUrl = typeof latestMetadata.repository === 'string'
            ? latestMetadata.repository
            : latestMetadata.repository?.url || ''

        this.supportUrl = latestMetadata.support_url || latestMetadata.homepage || this.supportUrl
        this.githubUrl = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '')
        this.info = {
            author: 'Author: ' + author,
            support_url: 'Plugin page: ' + this.supportUrl,
            github_url: 'GitHub: ' + this.githubUrl,
            buy_me_a_cafe: 'Buy me a coffee',
            version: 'Version ' + latestVersion + ' — released ' + (latestMetadata.date || ''),
        }
    }

    openSupportUrl (): void {
        this.platform.openExternal(this.supportUrl)
    }

    openGitHubUrl (): void {
        this.platform.openExternal(this.githubUrl)
    }

    openDonationPage (): void {
        this.platform.openExternal(CloudSyncSettingsData.donationUrl)
    }
}
