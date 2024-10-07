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

    private dbx: Dropbox

    translate = CloudSyncLang
    presetData = CloudSyncSettingsData

    connectedData = {
        isConnected: false,
        accessToken: '',
        location: '',
        refreshToken: '',
        email: '',
    }

    isConnecting = false
    isFormProcessing = false
    isSettingSaved = false
    isSaveSettingErrored = false

    callbackUrl = ''
    dropboxToken: string = '00_sl.B-QKHM3EHwCuTqZ65LnpvWoyt1NpqZWfb03jIBNdR-qBbK155Zw0Qf8l4H2jf4BvzT5jLH8fTpVXHD_toBgKH9JgLvrMFZgiQegDHBGcLA-ETUMrBkPpPEOG3JuReBS5Xd2Tuq9OoYuO'

    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {
        this.dbx = new Dropbox({clientId: '68h0g2tx5tao1l6', clientSecret: 'bdjvlag5age3e2c'})
    }

    ngOnInit (): void {
        // if (this.dropboxToken !== undefined) {
        //     const dbx = new Dropbox({ accessToken: this.dropboxToken })
        //     const remoteFile = CloudSyncSettingsData.cloudSettingsFilename
        //
        //     dbx.filesUpload({ path: '/test.txt', contents: 'Sample content' })
        //         .then((response: any) => {
        //             console.log('Dropbox file upload success');
        //             console.log(response);
        //         })
        //         .catch((uploadErr) => {
        //             console.log('Dropbox file upload failed')
        //             console.log(uploadErr);
        //             this.toast.error(uploadErr.message)
        //         });
        //
        //     dbx.filesListFolder({ path: '' })
        //         .then((response: any) => {
        //             console.log('Dropbox file list success');
        //             console.log(response);
        //         })
        //         .catch((err: any) => {
        //             console.log('Dropbox file list failed')
        //             console.log(err);
        //         });
        //     dbx.filesDownload({ path:  remoteFile }).then(function (response: any) {
        //         const reader = new FileReader()
        //         const blob: Blob = response.fileBlob
        //         reader.addEventListener('loadend', function (e) {
        //             console.log(e)
        //             const content =  JSON.parse(reader.result as string)
        //             console.log('Dropbox file download success')
        //             console.log(content)
        //         })
        //         reader.readAsText(blob)
        //     })
        //         .catch(function (error: any) {
        //             console.log('File download failed', error)
        //         })
        // }
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
                SettingsHelper.syncWithCloud(this.config, this.platform, this.toast, true).then(async (result) => {
                    const resultCheck = typeof result === 'boolean' ? result : result['result']
                    if (resultCheck) {
                        this.config.requestRestart()
                    } else {
                        this.setFormMessage.emit({
                            message: typeof result !== 'boolean' && result['message'] ? result['message'] : Lang.trans('sync.sync_server_failed'),
                            type: 'error',
                        })

                        this.isSettingSaved = false
                        this.isSaveSettingErrored = true
                        // await SettingsHelper.removeConfirmFile(this.platform, this.toast, false)
                    }
                    this.isFormProcessing = false
                })
            }
        })
    }

    async disconnect (): Promise<void> {
        this.connectedData.isConnected = false
        this.connectedData.accessToken = ''
        this.connectedData.refreshToken = ''
        this.connectedData.email = ''

        this.isConnecting = false
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
