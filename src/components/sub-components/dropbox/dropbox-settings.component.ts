// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../../data/lang'
import Logger from '../../../utils/Logger'
import {Dropbox} from "dropbox";
import * as url from "node:url";
import Lang from "../../../data/lang";

@Component({
    selector: 'dropbox-settings',
    template: require('./dropbox-settings.component.pug'),
    styles: [require('./dropbox-settings.component.scss')],
})
export class CloudSyncDropboxSettingsComponent implements OnInit {
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

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

    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {
        this.dbx = new Dropbox({clientId: '68h0g2tx5tao1l6', clientSecret: 'bdjvlag5age3e2c'})
    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)

        console.log('Cloud Configs', configs)
        if (configs) {
            if (configs.adapter === this.presetData.values.DROPBOX) {
                this.connectedData = configs.configs
                this.isSettingSaved = true
            }
        }

        this.dropboxServiceEmitter.subscribe(async (event: { action: string, result: boolean, message?: string }) => {
            switch (event.action) {
                case 'dropbox-sync-complete': {
                    if (event.result) {
                        this.isSettingSaved = true
                        this.config.requestRestart()
                    } else {
                        this.resetFormMessages.emit()
                        this.disconnect()
                        this.setFormMessage.emit({
                            message: event.message,
                            type: 'error',
                        })

                        this.isSettingSaved = false
                        this.isSaveSettingErrored = true
                        await SettingsHelper.removeConfirmFile(this.platform, this.toast, false)
                    }
                    break
                }
            }
        })
    }

    async connect (): Promise<void> {
        this.resetFormMessages.emit()
        const dbx = this.dbx;
        this.isConnecting = true
        // @ts-ignore
        dbx.auth.getAuthenticationUrl('http://localhost', null, 'code', 'offline', null, 'none', false)
            .then((authUrl) => {
                console.log(`authUrl:${authUrl}`);
                this.platform.openExternal(authUrl)
            });
    }

    handleAuthCallback() {
        if (!this.callbackUrl) {
            this.toast.error('Callback URL is not set')
        }

        this.isFormProcessing = true
        const dbx = this.dbx;
        const logger = new Logger(this.platform)

        const { code } = url.parse(this.callbackUrl, true).query;
        logger.log(`code:${code}`);

        // @ts-ignore
        dbx.auth.getAccessTokenFromCode('http://localhost', code)
            .then((token: any) => {
                console.log(`Token Result:${JSON.stringify(token)}`);
                // @ts-ignore
                dbx.auth.setRefreshToken(token.result.refresh_token);
                dbx.usersGetCurrentAccount()
                    .then((response) => {
                        logger.log('response ' + response.toString());
                        this.toast.success('Successfully connected to Dropbox!')
                        this.connectedData.isConnected = true
                        this.connectedData.accessToken = token.result.access_token
                        this.connectedData.refreshToken = token.result.refresh_token
                        this.connectedData.email = response.result.email
                        this.isFormProcessing = false
                    })
                    .catch((error) => {
                        logger.log(error, 'error');
                        this.toast.error(error.message)
                        this.isFormProcessing = false
                    });
            })
            .catch((error) => {
                this.toast.error(error.message)
                logger.log(error, 'error');
                this.isFormProcessing = false
            });
    }

    async saveSettings (): Promise<void> {
        this.resetFormMessages.emit()
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.DROPBOX, this.connectedData).then(result => {
            this.isFormProcessing = false
            if (!result) {
                this.setFormMessage.emit({
                    message: Lang.trans('settings.amazon.save_settings_failed'),
                    type: 'error',
                })
            } else {
                this.isSettingSaved = true
                this.setFormMessage.emit({
                    message: Lang.trans('settings.amazon.save_settings_success'),
                    type: 'success',
                })
                this.isSettingSaved = true
                SettingsHelper.syncWithCloud(this.config, this.platform, this.toast, true, this.dropboxServiceEmitter)
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
            message: 'Are you sure you want to disconnect?',
            buttons: ['Cancel', 'Disconnect'],
            defaultId: 0,
        })).response === 1) {
            await SettingsHelper.removeConfirmFile(this.platform, this.toast, false)
            this.disconnect()
            this.config.requestRestart()
        }
    }

    cancelConnect (): void {
        this.resetFormMessages.emit()
        this.isConnecting = false
    }

    async pasteFromClipboard () {
        const logger = new Logger(this.platform)
        try {
            const text = await navigator.clipboard.readText();
            logger.log('Clipboard text:', text);
            this.callbackUrl = text
            this.toast.success('Successfully pasted from clipboard')
        } catch (err) {
            logger.log('Failed to read clipboard contents: ' + err.toString(), 'error');
        }
    }
}
