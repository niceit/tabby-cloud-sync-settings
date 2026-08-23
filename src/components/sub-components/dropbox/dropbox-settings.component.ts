import { Component, EventEmitter, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import Logger from '../../../utils/Logger'
import { Dropbox } from 'dropbox'

@Component({
    selector: 'dropbox-settings',
    template: require('./dropbox-settings.component.pug'),
    styles: [require('./dropbox-settings.component.scss')],
})
export class CloudSyncDropboxSettingsComponent implements OnInit {
    private dropboxServiceEmitter = new EventEmitter()
    private dbx: Dropbox

    translate = CloudSyncLang
    presetData = CloudSyncSettingsData

    connectedData = {
        isConnected: false,
        accessToken: '',
        location: '',
        refreshToken: '',
        email: '',
        lastErrorMessage: ''
    }

    isConnecting = false
    isFormProcessing = false
    isSettingSaved = false
    isSaveSettingErrored = false
    callbackUrl = ''

    get connectedLabel (): string {
        return CloudSyncLang.trans('dropbox.connected', { email: this.connectedData.email })
    }

    get lastSyncErrorLabel (): string {
        return CloudSyncLang.trans('dropbox.last_sync_error', { message: this.connectedData.lastErrorMessage })
    }

    constructor (private config: ConfigService, private platform: PlatformService) {
        const logger = new Logger(this.platform)
        const dropboxForm = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX]
        if (!dropboxForm.apiKey || !dropboxForm.apiSecret) {
            PluginToast.error(CloudSyncLang.trans('dropbox.missing_app_credentials'))
            logger.log(CloudSyncLang.trans('dropbox.missing_app_credentials'))
        } else {
            this.dbx = new Dropbox({ clientId: dropboxForm.apiKey, clientSecret: dropboxForm.apiSecret })
        }
    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.presetData.values.DROPBOX) {
            this.connectedData = { ...configs.configs }
            this.isSettingSaved = true
        }

        this.dropboxServiceEmitter.subscribe(async (event: { action: string, result: boolean, message?: string }) => {
            if (event.action === 'dropbox-sync-complete') {
                if (event.result) {
                    this.isSettingSaved = true
                    this.config.requestRestart()
                } else {
                    this.disconnect()
                    PluginToast.error(event.message)

                    this.isSettingSaved = false
                    this.isSaveSettingErrored = true
                    await SettingsHelper.removeConfirmFile(this.platform, false)
                }
            }
        })
    }

    async connect (): Promise<void> {
        if (!this.dbx) {
            PluginToast.error(CloudSyncLang.trans('dropbox.missing_app_credentials'))
            return
        }
        const dbx = this.dbx
        const logger = new Logger(this.platform)
        this.isConnecting = true
        // @ts-ignore
        dbx.auth.getAuthenticationUrl('http://localhost', null, 'code', 'offline', null, 'none', false)
            .then((authUrl) => {
                logger.log(`authUrl:${authUrl}`)
                this.platform.openExternal(authUrl)
            })
    }

    handleAuthCallback (): void {
        if (!this.callbackUrl) {
            PluginToast.error(CloudSyncLang.trans('dropbox.missing_callback_url'))
            return
        }

        this.isFormProcessing = true
        const dbx = this.dbx
        const logger = new Logger(this.platform)

        const code = new URL(this.callbackUrl).searchParams.get('code')
        logger.log(`code:${code}`)

        // @ts-ignore
        dbx.auth.getAccessTokenFromCode('http://localhost', code)
            .then((token: any) => {
                // @ts-ignore
                dbx.auth.setRefreshToken(token.result.refresh_token)
                dbx.usersGetCurrentAccount()
                    .then((response) => {
                        PluginToast.success(CloudSyncLang.trans('dropbox.connect_success'))
                        this.connectedData.isConnected = true
                        this.connectedData.accessToken = token.result.access_token
                        this.connectedData.refreshToken = token.result.refresh_token
                        this.connectedData.email = response.result.email
                        this.isFormProcessing = false
                    })
                    .catch((error) => {
                        logger.log(error, 'error')
                        PluginToast.error(error.message)
                        this.isFormProcessing = false
                    })
            })
            .catch((error) => {
                PluginToast.error(error.message)
                logger.log(error, 'error')
                this.isFormProcessing = false
            })
    }

    async saveSettings (): Promise<void> {
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.DROPBOX, this.connectedData).then(result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(CloudSyncLang.trans('settings.amazon.save_settings_failed'))
            } else {
                this.isSettingSaved = true
                PluginToast.success(CloudSyncLang.trans('settings.amazon.save_settings_success'))
                SettingsHelper.syncWithCloud(this.config, this.platform, true, this.dropboxServiceEmitter)
            }
        })
    }

    disconnect (): void {
        this.connectedData.isConnected = false
        this.connectedData.accessToken = ''
        this.connectedData.refreshToken = ''
        this.connectedData.email = ''

        this.isConnecting = false
    }

    async disconnectSettings(): Promise<void> {
        if ((await this.platform.showMessageBox({
            type: 'warning',
            message: CloudSyncLang.trans('dropbox.confirm_disconnect'),
            buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.disconnect')],
            defaultId: 0,
        })).response === 1) {
            await SettingsHelper.removeConfirmFile(this.platform, false)
            this.disconnect()
            this.config.requestRestart()
        }
    }

    cancelConnect (): void {
        this.isConnecting = false
    }

    async pasteFromClipboard (): Promise<void> {
        const logger = new Logger(this.platform)
        try {
            const text = await navigator.clipboard.readText()
            this.callbackUrl = text
            PluginToast.success(CloudSyncLang.trans('dropbox.clipboard_success'))
        } catch (err) {
            PluginToast.error(CloudSyncLang.trans('dropbox.clipboard_error'))
            logger.log('Failed to read clipboard contents: ' + err.toString(), 'error')
        }
    }
}
