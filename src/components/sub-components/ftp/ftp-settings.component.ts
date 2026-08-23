import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import { SyncResult } from '../../../interface'
import Logger from '../../../utils/Logger'

interface formData {
    protocol: string,
    host: string,
    username: string,
    password: string,
    location: string,
    port: string
}

@Component({
    selector: 'ftp-settings',
    template: require('./ftp-settings.component.pug'),
    styles: [require('./ftp-settings.component.scss')],
})
export class CloudSyncFtpSettingsComponent implements OnInit {
    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false

    isSyncingProgress = false
    isFormProcessing = false
    passwordFieldType = 'password'

    protocol = [
        { value: 'ftp', name: 'FTP' },
        { value: 'ftps', name: 'FTPS' },
    ]
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.FTP] as formData

    constructor (private config: ConfigService, private platform: PlatformService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.presetData.values.FTP) {
            this.form = { ...configs.configs } as formData
            this.isSettingSaved = true
        }
        this.isPreloadingSavedConfig = false
    }

    toggleViewPassword (): void {
        this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password'
    }

    async testConnection (): Promise<void> {
        const logger = new Logger(this.platform)
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].toString().trim() === '') {
                PluginToast.error(CloudSyncLang.trans('form.error.required_all'))
                isFormValidated = false
                break
            }
        }

        if (isFormValidated) {
            if (this.form.location !== '/') {
                this.form.location = this.form.location.endsWith('/')
                    ? this.form.location.substr(0, this.form.location.length - 1)
                    : this.form.location
            }

            this.isFormProcessing = true
            const ftp = require('basic-ftp')
            const client = new ftp.Client(10000)
            client.ftp.verbose = true
            try {
                await client.access({
                    host: this.form.host,
                    port: this.form.port,
                    user: this.form.username,
                    password: this.form.password,
                    secure: this.form.protocol !== 'ftp',
                })

                await client.connect(this.form.host, this.form.port)
                    .then(result => {
                        this.isFormProcessing = false
                        if (result.code === 220) {
                            this.isCheckLoginSuccess = true
                            PluginToast.success(CloudSyncLang.trans('sync.setting_valid'))
                        } else {
                            PluginToast.error(CloudSyncLang.trans('sync.error_setting_save_file'))
                        }
                    })
            } catch (e) {
                this.isFormProcessing = false
                PluginToast.error(CloudSyncLang.trans('sync.error_connection'))
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            }

            if (!client.closed) {
                client.close()
            }
        }
    }

    async saveSettings (): Promise<void> {
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.FTP, this.form).then(async result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(CloudSyncLang.trans('settings.amazon.save_settings_failed'))
            } else {
                PluginToast.success(CloudSyncLang.trans('settings.amazon.save_settings_success'))
                this.isSettingSaved = true
                this.isSyncingProgress = true
                await SettingsHelper.syncWithCloud(this.config, this.platform, true).then(async (result: SyncResult) => {
                    if (result.result) {
                        this.config.requestRestart()
                    } else {
                        PluginToast.error(result.message || CloudSyncLang.trans('sync.sync_server_failed'))
                        this.isSettingSaved = false
                        this.isCheckLoginSuccess = false
                        this.isPreloadingSavedConfig = false
                        await SettingsHelper.removeConfirmFile(this.platform, false)
                    }
                    this.isSyncingProgress = false
                })
            }
        })
    }

    cancelSaveSettings (): void {
        this.isCheckLoginSuccess = false
    }

    async removeSavedSettings (): Promise<void> {
        const result = await SettingsHelper.removeConfirmFile(this.platform)
        if (result) {
            this.isSettingSaved = false
            this.isCheckLoginSuccess = false
            this.isPreloadingSavedConfig = false
            this.config.requestRestart()
        }
    }
}
