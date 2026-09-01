import { Injectable } from '@angular/core'
import { CloudSyncActions } from './cloud-sync-actions'

const terminusCore = require('terminus-core')

export const CommandProvider = terminusCore.CommandProvider || class CommandProvider {
    provide (_context: { tab?: any }): Promise<any[]> { return Promise.resolve([]) }
}

type CommandContext = { tab?: any }
type Command = {
    id?: string
    label: string
    run: () => Promise<void>
}

@Injectable()
export class CloudSyncCommandProvider extends CommandProvider {
    constructor (private actions: CloudSyncActions) {
        super()
    }

    async provide (_context: CommandContext): Promise<Command[]> {
        return [
            {
                id: 'cloud-sync:sync-now',
                label: 'Sync now',
                run: () => this.actions.syncNow(),
            },
            {
                id: 'cloud-sync:upload-local-settings',
                label: 'Upload local settings',
                run: () => this.actions.uploadLocalSettings(),
            },
            {
                id: 'cloud-sync:download-cloud-settings',
                label: 'Download cloud settings',
                run: () => this.actions.downloadCloudSettings(),
            },
            {
                id: 'cloud-sync:open-settings',
                label: 'Open cloud sync settings',
                run: async () => this.actions.openSettings(),
            },
        ]
    }
}
