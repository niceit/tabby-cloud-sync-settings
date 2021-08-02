import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import cloudSyncSettingsHelper from '../../../utils/CloudSyncSettingsHelper'
import Lang from '../../../data/lang'
import AmazonS3 from '../../../utils/cloud-components/AmazonS3'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from "../../../utils/settings-helper";

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

    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isServiceAccountCheckPassed = false
    isFormProcessing = false
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.S3] as formData
    s3Regions = []

    constructor() {}

    ngOnInit (): void {
        this.s3Regions = cloudSyncSettingsHelper.getS3regionsList()
        this.form.region = this.s3Regions[0].value

        const configs = SettingsHelper.readConfigFile()
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
            this.isFormProcessing = true
            AmazonS3.setConfig(
                this.form.appId,
                this.form.appSecret,
                this.form.bucket,
                this.form.region,
                this.form.location,
            )
            AmazonS3.testConnection().then(response => {
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

    saveAmazonS3Settings (): void {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        AmazonS3.saveSettings(this.form).then(result => {
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
        this.isServiceAccountCheckPassed = false
    }

    removeSavedSettings (): void {

    }
}
