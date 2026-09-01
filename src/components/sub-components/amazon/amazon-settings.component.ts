import { Component, Input, OnInit } from '@angular/core'
import cloudSyncSettingsHelper from '../../../utils/CloudSyncSettingsHelper'
import AmazonS3 from '../../../utils/cloud-components/AmazonS3'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import { SyncResult } from '../../../interface'

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

    constructor (private config: ConfigService, private platform: PlatformService) {}
    ngOnInit (): void {
        this.s3Regions = cloudSyncSettingsHelper.getS3regionsList(this.provider)
        if (![this.presetData.values.BLACKBLAZE, this.presetData.values.S3_COMPATIBLE].includes(this.provider)) {
            this.form.region = this.s3Regions[0].value
        } else {
            this.form.region = ''
        }

        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.provider) {
            this.form = { ...configs.configs } as formData
            this.isSettingSaved = true
        }
        this.isPreloadingSavedConfig = false
        AmazonS3.setProvider(this.provider)
    }

    validateFormInput (): boolean {
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].toString().trim() === '') {
                if (this.provider === this.presetData.values.S3_COMPATIBLE && idx === 'region') {continue}

                PluginToast.error(CloudSyncLang.trans('form.error.required_all'))
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
                PluginToast.error(CloudSyncLang.trans('settings.error_connection_timeout'))
            }, 15000)
            AmazonS3.testConnection(this.platform, this.form).then(response => {
                if (!isTimedOut) {
                    clearTimeout(timeOutConnectionCheck)
                    this.isFormProcessing = false
                    if (response.hasOwnProperty('code') && parseInt(response.code) === 0) {
                        PluginToast.error(response.message)
                    } else {
                        PluginToast.success(CloudSyncLang.trans('settings.amazon.connected'))
                        this.isServiceAccountCheckPassed = true
                    }
                }
            }).catch(() => {
                this.isFormProcessing = false
            })
        }
    }

    async saveAmazonS3Settings (): Promise<void> {
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, this.provider, this.form).then(async result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(CloudSyncLang.trans('settings.amazon.save_settings_failed'))
            } else {
                PluginToast.success(CloudSyncLang.trans('settings.amazon.save_settings_success'))

                this.isSettingSaved = true
                this.isSyncingProgress = true
                await SettingsHelper.syncWithCloud(this.config, this.platform, true).then(async (subResult: SyncResult) => {
                    if (subResult.result) {
                        this.config.requestRestart()
                    } else {
                        PluginToast.error(subResult.message || CloudSyncLang.trans('sync.sync_server_failed'))
                        this.isSettingSaved = false
                        this.isServiceAccountCheckPassed = false
                        this.isPreloadingSavedConfig = false
                        await SettingsHelper.removeConfirmFile(this.platform, false)
                    }
                    this.isSyncingProgress = false
                })
            }
        })
    }

    cancelSaveSettings (): void {
        this.isServiceAccountCheckPassed = false
    }

    openBlackBlazeRegionHelp (): void {
        this.platform.openExternal(this.presetData.external_urls.BlackBlazeHelp)
    }

    async removeSavedSettings (): Promise<void> {
        const result = await SettingsHelper.removeConfirmFile(this.platform)
        if (result) {
            this.isSettingSaved = false
            this.isServiceAccountCheckPassed = false
            this.isPreloadingSavedConfig = false
            this.config.requestRestart()
        }
    }
}
