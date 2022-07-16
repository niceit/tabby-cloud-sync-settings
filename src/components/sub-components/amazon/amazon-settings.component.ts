// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'
import cloudSyncSettingsHelper from '../../../utils/CloudSyncSettingsHelper'
import AmazonS3 from '../../../utils/cloud-components/AmazonS3'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../../data/lang'
import Logger from '../../../utils/Logger'

interface formData {
    endpointUrl: string,
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
    @Input() provider: string

    presetData = CloudSyncSettingsData
    translate = CloudSyncLang
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isServiceAccountCheckPassed = false
    isFormProcessing = false
    isSyncingProgress = false
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.S3] as formData
    s3Regions = []

    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {}
    ngOnInit (): void {
        const logger = new Logger(this.platform)
        this.s3Regions = cloudSyncSettingsHelper.getS3regionsList(this.provider)
        if (![this.presetData.values.BLACKBLAZE, this.presetData.values.S3_COMPATIBLE].includes(this.provider)) {
            this.form.region = this.s3Regions[0].value
        } else {
            this.form.region = ''
        }

        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs) {
            if (configs.adapter === this.provider) {
                this.form = configs.configs as formData
                this.isSettingSaved = true
            }
        }
        this.isPreloadingSavedConfig = false
        AmazonS3.setProvider(this.provider)
        logger.log('Inside instance => ' + this.provider)
    }

    validateFormInput (): boolean {
        this.resetFormMessages.emit()
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].trim() === '') {
                if (this.provider === this.presetData.values.S3_COMPATIBLE && idx === 'region') {continue}

                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('form.error.required_all'),
                    type: 'error',
                })
                isFormValidated = false
                break
            }
        }

        return isFormValidated
    }

    correctLocationPath (): void {
        if (this.form.location !== '/') {
            this.form.location = this.form.location.endsWith('/')
                ? this.form.location.substr(0, this.form.location.length - 1)
                : this.form.location
        }
    }

    performLoginAmazonS3 (): void {
        if (this.validateFormInput()) {
            this.correctLocationPath()
            this.isFormProcessing = true
            let isTimedOut = false
            const timeOutConnectionCheck = setTimeout(() => {
                isTimedOut = true
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('settings.error_connection_timeout'),
                    type: 'error',
                })
            }, 15000)
            AmazonS3.testConnection(this.platform, this.form).then(response => {
                if (!isTimedOut) {
                    clearTimeout(timeOutConnectionCheck)
                    this.isFormProcessing = false
                    console.log('Response | ', response)
                    if (response.hasOwnProperty('code') && parseInt(response.code) === 0) {
                        this.setFormMessage.emit({
                            message: response.message,
                            type: 'error',
                        })
                    } else {
                        this.setFormMessage.emit({
                            message: CloudSyncLang.trans('settings.amazon.connected'),
                            type: 'success',
                        })
                        this.isServiceAccountCheckPassed = true
                    }
                }
            }).catch((err) => {
                console.log('error | ', err)
                this.isFormProcessing = false
            })
        }
    }

    async saveAmazonS3Settings (): Promise<void> {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, this.provider, this.form).then(async result => {
            this.isFormProcessing = false
            if (!result) {
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('settings.amazon.save_settings_failed'),
                    type: 'error',
                })
            } else {
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('settings.amazon.save_settings_success'),
                    type: 'success',
                })

                this.isSettingSaved = true
                this.isSyncingProgress = true
                await SettingsHelper.syncWithCloud(this.config, this.platform, this.toast, true).then(async (subResult: any) => {
                    const resultCheck = typeof subResult === 'boolean' ? subResult : subResult['result']
                    if (resultCheck) {
                        this.config.requestRestart()
                    } else {
                        this.setFormMessage.emit({
                            message: typeof subResult !== 'boolean' && subResult['message']
                                ? subResult['message']
                                : CloudSyncLang.trans('sync.sync_server_failed'),
                            type: 'error',
                        })
                        this.isSettingSaved = false
                        this.isServiceAccountCheckPassed = false
                        this.isPreloadingSavedConfig = false
                        await SettingsHelper.removeConfirmFile(this.platform, this.toast, false)
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

    openBlackBlazeRegionHelp (): void {
        this.platform.openExternal(this.presetData.external_urls.BlackBlazeHelp)
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
