import { Injectable } from '@angular/core'
import { ToolbarButton, ToolbarButtonProvider } from 'terminus-core'
import { CloudSyncActions } from './cloud-sync-actions'

const CLOUD_SYNC_ICON = '<svg aria-hidden="true" focusable="false" role="img" data-icon="cloud" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M18.5 18H6a4 4 0 0 1-.44-7.98A6.5 6.5 0 0 1 18.1 8.18 5 5 0 0 1 18.5 18ZM6 12a2 2 0 1 0 0 4h12.5a3 3 0 0 0 .03-6 1 1 0 0 1-1.02-.78A4.5 4.5 0 0 0 8.7 10.5a1 1 0 0 1-1.2 1.5H6Z"/></svg>'

@Injectable()
export class CloudSyncToolbarProvider extends ToolbarButtonProvider {
    constructor (private actions: CloudSyncActions) {
        super()
    }

    provide (): ToolbarButton[] {
        const status = this.actions.status
        const opensSettings = status !== 'ready'

        return [{
            icon: CLOUD_SYNC_ICON,
            title: 'Cloud Sync Settings',
            weight: 11,
            click: () => opensSettings ? this.actions.openSettings() : this.actions.syncNow(),
            submenu: async () => {
                const settingsItem = {
                    title: status === 'unconfigured' ? 'Set up Cloud Sync Settings' : 'Open Cloud Sync Settings',
                    click: () => this.actions.openSettings(),
                }

                if (status === 'unconfigured' || status === 'disabled' || status === 'conflict') {
                    return [settingsItem]
                }

                return [
                    {
                        title: 'Sync settings now',
                        click: () => this.actions.syncNow(),
                    },
                    {
                        title: 'Upload settings from this device',
                        click: () => this.actions.uploadLocalSettings(),
                    },
                    {
                        title: 'Download cloud settings to this device',
                        click: () => this.actions.downloadCloudSettings(),
                    },
                    settingsItem,
                ]
            },
        }]
    }
}
