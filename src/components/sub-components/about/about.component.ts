import { Component, OnInit } from '@angular/core'
import { PlatformService } from 'terminus-core'
import axios from 'axios'
import CloudSyncSettingsData from '../../../data/setting-items'
import {
    author as packageAuthor,
    date as packageReleaseDate,
    github_url as packageGitHubUrl,
    support_url as packageSupportUrl,
    version as packageVersion,
} from '../../../../package.json'

@Component({
    selector: 'cloud-sync-about',
    template: require('./cloud-sync-about.component.pug'),
    styles: [require('./cloud-sync-about.component.scss')],
})
export class CloudSyncAboutComponent implements OnInit {
    supportUrl = packageSupportUrl || CloudSyncSettingsData.pluginUrl
    githubUrl = packageGitHubUrl.replace(/^git\+/, '').replace(/\.git$/, '')

    info = {
        author: 'Author: ' + packageAuthor,
        support_url: 'Plugin page: ' + this.supportUrl,
        github_url: 'GitHub: ' + this.githubUrl,
        buy_me_a_cafe: 'Buy me a coffee',
        version: 'Version ' + packageVersion + ' — released ' + packageReleaseDate,
    }

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
        const installedMetadata = response.data?.versions?.[packageVersion]
        if (!installedMetadata) {
            return
        }

        const author = typeof installedMetadata.author === 'string'
            ? installedMetadata.author
            : installedMetadata.author?.name || packageAuthor
        const repositoryUrl = typeof installedMetadata.repository === 'string'
            ? installedMetadata.repository
            : installedMetadata.repository?.url || this.githubUrl

        this.supportUrl = installedMetadata.support_url || installedMetadata.homepage || this.supportUrl
        this.githubUrl = repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, '')
        this.info = {
            author: 'Author: ' + author,
            support_url: 'Plugin page: ' + this.supportUrl,
            github_url: 'GitHub: ' + this.githubUrl,
            buy_me_a_cafe: 'Buy me a coffee',
            version: 'Version ' + packageVersion + ' — released ' + packageReleaseDate,
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
