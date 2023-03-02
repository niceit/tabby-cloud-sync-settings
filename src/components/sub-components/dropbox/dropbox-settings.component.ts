// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../../data/lang'
import Logger from '../../../utils/Logger'

@Component({
    selector: 'dropbox-settings',
    template: require('./dropbox-settings.component.pug'),
    styles: [require('./dropbox-settings.component.scss')],
})
export class CloudSyncDropboxSettingsComponent implements OnInit {
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isConnectingDropbox = false
    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {

    }

    ngOnInit (): void {
        /*
        if (this.dropboxToken !== undefined) {
            const dbx = new Dropbox({ accessToken: this.dropboxToken })
            const remoteFile = CloudSyncSettingsData.cloudSettingsFilename

            dbx.filesUpload({ path: '/test.txt', contents: 'Sample content' })
                .then((response: any) => {
                    console.log('Dropbox file upload success');
                    console.log(response);
                })
                .catch((uploadErr) => {
                    console.log('Dropbox file upload failed')
                    console.log(uploadErr);
                });

            dbx.filesListFolder({ path: '' })
                .then((response: any) => {
                    console.log('Dropbox file list success');
                    console.log(response);
                })
                .catch((err: any) => {
                    console.log('Dropbox file list failed')
                    console.log(err);
                });
            dbx.filesDownload({ path:  remoteFile }).then(function (response: any) {
                const reader = new FileReader()
                const blob: Blob = response.fileBlob
                reader.addEventListener('loadend', function (e) {
                    console.log(e)
                    const content =  JSON.parse(reader.result as string)
                    console.log('Dropbox file download success')
                    console.log(content)
                })
                reader.readAsText(blob)
            })
                .catch(function (error: any) {
                    console.log('File download failed', error)
                })
        }
         */
    }

    async connect (): Promise<void> {
        this.resetFormMessages.emit()
        const authUrl = 'https://www.dropbox.com/oauth2/authorize?client_id=ll0jdwesipndd80&response_type=code&token_access_type=offline&state=code&redirect_uri=https://dev.ws.phprockets.com/dropbox-auth-redirect'
        this.platform.openExternal(authUrl)
    }

    async saveSettings (): Promise<void> {
        this.resetFormMessages.emit()
    }

    async disconnect (): Promise<void> {
        this.resetFormMessages.emit()
        const result = await SettingsHelper.removeConfirmFile(this.platform, this.toast)
        if (result) {
            this.config.requestRestart()
        }
    }
}
