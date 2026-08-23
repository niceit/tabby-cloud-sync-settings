import { Component } from '@angular/core'
import { PlatformService } from 'terminus-core'
import CloudSyncSettingsData from '../../data/setting-items'
import CloudSyncLang from '../../data/lang'

@Component({
    selector: 'cloud-sync-feedback-form',
    template: require('./feedback.component.pug'),
    styles: [require('./feedback.component.scss')],
})
export class CloudSyncFeedbackComponent {
    translate = CloudSyncLang

    constructor (private platform: PlatformService) {
        // do nothing
    }

    openIssuesPage (): void {
        this.platform.openExternal(CloudSyncSettingsData.external_urls.githubIssuesUrl)
    }
}
