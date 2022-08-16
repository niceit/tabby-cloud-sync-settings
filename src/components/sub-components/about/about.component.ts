import { Component, OnInit } from '@angular/core'
import { author, support_url, github_url, version, date } from '../../../../package.json'
import { PlatformService } from 'terminus-core'

@Component({
    selector: 'cloud-sync-about',
    template: require('./cloud-sync-about.component.pug'),
    styles: [require('./cloud-sync-about.component.scss')],
})
export class CloudSyncAboutComponent implements OnInit {
    info = {
        author: 'Author: ' + author,
        support_url: 'Plugin support URL: ' + support_url,
        github_url: 'Github URL: ' + github_url,
        version: 'Version: ' + version + ' - Updated date ' + date,
    }

    constructor (private platform: PlatformService) {
        // do nothing
    }

    ngOnInit (): void {
        // do nothing
    }

    openSupportUrl (): void {
        this.platform.openExternal(support_url)
    }

    openGitHubUrl (): void {
        this.platform.openExternal(github_url)
    }
}
