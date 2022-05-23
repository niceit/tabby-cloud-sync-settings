// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../../data/lang'
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
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

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

    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {

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

    toggleViewPassword (): void {
        this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password'
    }

    async testConnection (): Promise<void> {
        const logger = new Logger(this.platform)
        this.resetFormMessages.emit()
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].toString().trim() === '') {
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('form.error.required_all'),
                    type: 'error',
                })
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
                            this.setFormMessage.emit({
                                message: CloudSyncLang.trans('sync.setting_valid'),
                                type: 'success',
                            })
                        } else {
                            this.setFormMessage.emit({
                                message: CloudSyncLang.trans('sync.error_setting_save_file'),
                                type: 'error',
                            })
                        }
                    })
            } catch (e) {
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('sync.error_connection'),
                    type: 'error',
                })
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            }

            if (!client.closed) {
                client.close()
            }
        }
    }

    async saveSettings (): Promise<void> {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.FTP, this.form).then(async result => {
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
                await SettingsHelper.syncWithCloud(this.config, this.platform, this.toast, true).then(async (result) => {
                    const resultCheck = typeof result === 'boolean' ? result : result['result']
                    console.log('RESULT', result)
                    if (resultCheck) {
                        this.config.requestRestart()
                    } else {
                        this.setFormMessage.emit({
                            message: typeof result !== 'boolean' && result['message'] ? result['message'] : CloudSyncLang.trans('sync.sync_server_failed'),
                            type: 'error',
                        })
                        this.isSettingSaved = false
                        this.isCheckLoginSuccess = false
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
