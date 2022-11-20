import { Injectable } from '@angular/core'
import { Logger, PlatformService } from 'terminus-core'

import { name as packageName } from '../../package.json'
@Injectable({ providedIn: 'root' })
export class TabbySyncUpgradeService {
    logger: Logger
    private constructor (
        private platform: PlatformService,
    ) { }

    async installPlugin (version: string): Promise<void> {
        try {
            await this.platform.installPlugin(packageName, version)
        } catch (err) {
            throw err
        }
    }
}
