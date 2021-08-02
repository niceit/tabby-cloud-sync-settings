import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import { AuthType, createClient } from 'webdav'
import Lang from '../../../data/lang'
import SettingsHelper from '../../../utils/settings-helper'
import {fsReadFile} from "ts-loader/dist/utils";

interface formData {
    host: string,
    port: string,
    username: string,
    password: string,
    location: string,
}

@Component({
    selector: 'webdav-settings',
    template: require('./webdav-settings.component.pug'),
    styles: [require('./webdav-settings.component.scss')],
})
export class CloudSyncWebDavSettingsComponent implements OnInit {
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false
    isFormProcessing = false
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.WEBDAV] as formData

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile()
        if (configs) {
            if (configs.adapter === this.presetData.values.WEBDAV) {
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
            const client = createClient(this.form.host +':'+ this.form.port, {
                authType: AuthType.Password,
                username: this.form.username,
                password: this.form.password,
            })
            this.isFormProcessing = true
            try {
                await client.putFileContents(this.form.location + 'test.txt', 'Test content', { overwrite: true }).then(() => {
                    this.isFormProcessing = false
                    this.isCheckLoginSuccess = true
                    this.setFormMessage.emit({
                        message: 'Your setting is valid.',
                        type: 'success',
                    })
                })
            } catch (e) {
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: 'Unable to connect with your settings',
                    type: 'error',
                })
            }
        }
    }

    saveSettings (): void {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(CloudSyncSettingsData.values.WEBDAV, this.form).then(result => {
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
