import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import Lang from '../../../data/lang'
import SettingsHelper from '../../../utils/settings-helper'
import {ConfigService, PlatformService} from "terminus-core";

interface formData {
    protocol: string,
    host: string,
    username: string,
    password: string,
    location: string,
}

@Component({
    selector: 'ftp-settings',
    template: require('./ftp-settings.component.pug'),
    styles: [require('./ftp-settings.component.scss')],
})
export class CloudSyncFtpSettingsComponent implements OnInit {
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false
    isFormProcessing = false
    protocol = [
        { value: 'ftp', name: 'FTP' },
        { value: 'sftp', name: 'sFTP' },
    ]
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.FTP] as formData

    constructor(private config: ConfigService, private platform: PlatformService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs) {
            if (configs.adapter === this.presetData.values.FTP) {
                this.form = configs.configs as formData
                this.isSettingSaved = true
            }
        }
        this.isPreloadingSavedConfig = false
    }

    async testConnection (): Promise<void> {
        this.resetFormMessages.emit()
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].trim() === '') {
                this.setFormMessage.emit({
                    message: Lang.trans('form.error.required_all'),
                    type: 'error',
                })
                isFormValidated = false
                break
            }
        }

        if (isFormValidated) {
            this.isFormProcessing = true
            const ftp = require('basic-ftp')
            const client = new ftp.Client()
            client.ftp.verbose = true
            try {
                await client.access({
                    host: this.form.host,
                    user: this.form.username,
                    password: this.form.password,
                    secure: this.form.protocol !== 'ftp',
                })

                const resolve = require('path').resolve
                const testFile = resolve('./tabby-cloud-sync-settings/src/data/test.txt')
                await client.uploadFrom(testFile, this.form.location + 'test.txt')
                    .then(result => {
                        this.isFormProcessing = false
                        if (result.code === 226) {
                            this.isCheckLoginSuccess = true
                            this.setFormMessage.emit({
                                message: 'Your setting is valid.',
                                type: 'success',
                            })

                            client.remove(testFile)
                        } else {
                            this.setFormMessage.emit({
                                message: 'Connect Ok. But unable to write file at this location!',
                                type: 'error',
                            })
                        }
                    })
            } catch (err) {
                console.log(err)
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: 'Unable to connect with your settings',
                    type: 'error',
                })
            }
            client.close()
        }
    }

    saveSettings (): void {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.FTP, this.form).then(result => {
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
                this.config.requestRestart()
            }
        })
    }

    cancelSaveSettings (): void {
        this.resetFormMessages.emit()
        this.isCheckLoginSuccess = false
    }

    removeSavedSettings (): void {

    }
}
