import { ConfigService, PlatformService } from 'terminus-core'
import { GistParams, SyncResult } from '../../../interface'
import Github from './github'
import Gitee from './gitee'
import Gitlab from './gitlab'
import Gist from '../gist'
import SettingsHelper from '../../settings-helper'

type GistFactory = (id: string, accessToken: string) => Gist

/**
 * Facade that dispatches gist sync operations to the correct provider based on
 * the stored `type` (github/gitee/gitlab).
 */
class Gists {
    private factories: Record<string, GistFactory> = {
        github: (id, token) => new Github(id, token),
        gitee: (id, token) => new Gitee(id, token),
        gitlab: (id, token) => new Gitlab(id, token),
    }

    /** Instantiate the provider component for a given gist type. */
    private createComponent (type: string, id: string, accessToken: string): Gist {
        const factory = this.factories[type]
        return factory ? factory(id, accessToken) : null
    }

    sync = async (config: ConfigService, platform: PlatformService, params: GistParams, firstInit = false): Promise<SyncResult> => {
        const component = this.createComponent(params.type, params.id, params.accessToken)
        if (!component) {
            return { result: false, message: '' }
        }

        return component.sync(config, platform, params, firstInit)
    }

    syncLocalSettingsToCloud = async (platform: PlatformService): Promise<boolean> => {
        const configs = SettingsHelper.readConfigFile(platform).configs as GistParams
        const component = this.createComponent(configs.type, configs.id, configs.accessToken)
        if (!component) {
            return false
        }

        return component.syncLocalSettingsToCloud(platform)
    }
}

export default new Gists()
