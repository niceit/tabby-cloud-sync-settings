import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import { AuthType, createClient } from 'webdav'
import Lang from '../../../data/lang'
import SettingsHelper from '../../../utils/settings-helper'
import {ConfigService, PlatformService} from "terminus-core"
import {ToastrService} from "ngx-toastr"
import CloudSyncLang from "../../../data/lang";

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

    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false
    isFormProcessing = false
    isSyncingProgress = false

    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.WEBDAV] as formData

    constructor(private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
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
            if (this.form[idx].trim() === '' && idx !== 'port') {
                this.setFormMessage.emit({
                    message: Lang.trans('form.error.required_all'),
                    type: 'error',
                })
                isFormValidated = false
                break
            }
        }

        if (isFormValidated) {
            const client = createClient(this.form.host + (this.form.port ? (':'+ this.form.port) : ''), {
                authType: AuthType.Password,
                username: this.form.username,
                password: this.form.password,
            })
            this.isFormProcessing = true
            if (this.form.location !== '/') {
                this.form.location = this.form.location.endsWith('/')
                    ? this.form.location.substr(0,this.form.location.length - 1)
                    : this.form.location
            }

            try {
                await client.putFileContents(this.form.location + 'test.txt', 'Test content', { overwrite: true }).then(() => {
                    this.isFormProcessing = false
                    this.isCheckLoginSuccess = true
                    this.setFormMessage.emit({
                        message: 'Your setting is valid.',
                        type: 'success',
                    })
                    client.deleteFile(this.form.location + 'test.txt')
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

    async saveSettings (): Promise<void> {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.WEBDAV, this.form).then(result => {
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
                    if (result) {
                        this.config.requestRestart()
                    } else {
                        this.setFormMessage.emit({
                            message: Lang.trans('sync.sync_server_failed'),
                            type: 'error',
                        })
                        this.isSettingSaved = false
                        this.isCheckLoginSuccess = false
                        this.isPreloadingSavedConfig = false
                        await SettingsHelper.removeConfirmFile(this.platform, this.toast)
                    }
                    this.isSyncingProgress = false
                })
            }
        })
    }

    cancelSaveSettings (): void {
        this.resetFormMessages.emit()
        this.isCheckLoginSuccess = false
    }

    async removeSavedSettings (): Promise<void> {
        this.resetFormMessages.emit()
        const result = await SettingsHelper.removeConfirmFile(this.platform, this.toast)
        if (result) {
            this.isSettingSaved = false
            this.isCheckLoginSuccess = false
            this.isPreloadingSavedConfig = false
            this.config.requestRestart()
        }
    }
}
