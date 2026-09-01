import { Injectable } from '@angular/core'
import { PlatformService } from 'terminus-core'

import { name as packageName } from '../../package.json'

@Injectable({ providedIn: 'root' })
export class TabbySyncUpgradeService {
    constructor (
        private platform: PlatformService,
    ) { }

    /**
     * Installs (or upgrades to) the given version of this plugin.
     * @param version Target plugin version to install.
     */
    async installPlugin (version: string): Promise<void> {
        await this.platform.installPlugin(packageName, version)
    }
}
