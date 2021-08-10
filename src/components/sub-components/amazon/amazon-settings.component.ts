import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import cloudSyncSettingsHelper from '../../../utils/CloudSyncSettingsHelper'
import Lang from '../../../data/lang'
import AmazonS3 from '../../../utils/cloud-components/AmazonS3'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from "../../../utils/settings-helper"
import {ConfigService, PlatformService} from "terminus-core"
import {ToastrService} from "ngx-toastr";
import CloudSyncLang from "../../../data/lang";

interface formData {
    appId: string,
    appSecret: string,
    bucket: string,
    region: string,
    location: string,
}

@Component({
    selector: 'amazon-settings',
    template: require('./amazon-settings.component.pug'),
    styles: [require('./amazon-settings.component.scss')],
})
export class CloudSyncAmazonSettingsComponent implements OnInit {
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isServiceAccountCheckPassed = false
    isFormProcessing = false
    isSyncingProgress = false
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.S3] as formData
    s3Regions = []

    constructor(private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {
    }

    ngOnInit (): void {
        this.s3Regions = cloudSyncSettingsHelper.getS3regionsList()
        this.form.region = this.s3Regions[0].value

        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs) {
            if (configs.adapter === this.presetData.values.S3) {
                this.form = configs.configs as formData
                this.isSettingSaved = true
            }
        }
        this.isPreloadingSavedConfig = false
    }

    performLoginAmazonS3 (): void {
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
            if (this.form.location !== '/') {
                this.form.location = this.form.location.endsWith('/')
                    ? this.form.location.substr(0,this.form.location.length - 1)
                    : this.form.location
            }

            this.isFormProcessing = true
            AmazonS3.setConfig(
                this.form.appId,
                this.form.appSecret,
                this.form.bucket,
                this.form.region,
                this.form.location,
            )
            AmazonS3.testConnection(this.platform).then(response => {
                this.isFormProcessing = false
                if (response.hasOwnProperty('code') && !response.code) {
                    this.setFormMessage.emit({
                        message: response.message,
                        type: 'error',
                    })
                } else {
                    this.setFormMessage.emit({
                        message: Lang.trans('settings.amazon.connected'),
                        type: 'success',
                    })
                    this.isServiceAccountCheckPassed = true
                }
            })
        }
    }

    async saveAmazonS3Settings (): Promise<void> {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.S3, this.form).then(async result => {
            this.isFormProcessing = false
            if (!result) {
                this.setFormMessage.emit({
                    message: Lang.trans('settings.amazon.save_settings_failed'),
                    type: 'error',
                })
            } else {
                this.setFormMessage.emit({
                    message: Lang.trans('settings.amazon.save_settings_success'),
                    type: 'success',
                })

                this.isSettingSaved = true
                this.isSyncingProgress = true
                await SettingsHelper.syncWithCloud(this.config, this.platform, this.toast, true).then(async (result) => {
                    if (result) {
                        this.config.requestRestart()
                    } else {
                        this.setFormMessage.emit({
                            message: Lang.trans('sync.sync_server_failed'),
                            type: 'error',
                        })
                        this.isSettingSaved = false
                        this.isServiceAccountCheckPassed = false
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
        this.isServiceAccountCheckPassed = false
    }

    async removeSavedSettings (): Promise<void> {
        this.resetFormMessages.emit()
        const result = await SettingsHelper.removeConfirmFile(this.platform, this.toast)
        if (result) {
            this.isSettingSaved = false
            this.isServiceAccountCheckPassed = false
            this.isPreloadingSavedConfig = false
            this.config.requestRestart()
        }
    }
}
