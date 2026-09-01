import { PlatformService } from 'terminus-core'
import axios from 'axios'
import Logger from '../../Logger'
import CloudSyncLang from '../../../data/lang'
import Gist from '../gist'
import CloudSyncSettingsData from '../../../data/setting-items'

class Github extends Gist {
    constructor (id: string, accessToken: string) {
        super(CloudSyncSettingsData.gistUrls.github, id, accessToken)
    }

    protected getProviderLabel (): string {
        return 'GitHub Gist'
    }

    protected getGistType (): string {
        return 'github'
    }

    protected getAuthHeaders (): any {
        return { Authorization: `Bearer ${this.accessToken}` }
    }

    protected createComponent (id: string, accessToken: string): Gist {
        return new Github(id, accessToken)
    }

    /**
     * Verify the token, creating a new gist when no id is configured.
     *
     * @return `{ code: 1, data }` on success or `{ code: 0, message }`.
     */
    testConnection = async (platform: PlatformService): Promise<any> => {
        const logger = new Logger(platform)
        if (!this.id) {
            const createGist = await axios.post(this.baseRequestUrl, {
                files: { 'tabby-sync-settings': { content: this.getDummyContent() } },
                description: this.getSyncTextDateTime(),
                'public': false,
            }, {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    Authorization: `Bearer ${this.accessToken}`,
                },
            }).then((data) => {
                return { code: 1, data: data.data }
            }).catch(() => {
                return { code: 0 }
            })

            if (!createGist.code) {
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + CloudSyncLang.trans('gist.error_create_gist'), 'error')
                return { code: 0, message: CloudSyncLang.trans('gist.error_create_gist') }
            }
            this.id = createGist['data'].id
        }

        return axios.get(`${this.baseRequestUrl}/${this.id}`, {
            headers: { Authorization: `Bearer ${this.accessToken}` },
        }).then(data => {
            return { code: 1, data: data.data }
        }).catch(e => {
            logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            return { code: 0, message: e.toString() }
        })
    }
}

export default Github
