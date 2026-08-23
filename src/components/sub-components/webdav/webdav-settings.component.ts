import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import { AuthType, createClient } from 'webdav'
import Lang from '../../../data/lang'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import { SyncResult } from '../../../interface'
import Logger from '../../../utils/Logger'
import WebDav from '../../../utils/cloud-components/WebDav'

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
    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false
    isFormProcessing = false
    isSyncingProgress = false

    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.WEBDAV] as formData

    constructor (private config: ConfigService, private platform: PlatformService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.presetData.values.WEBDAV) {
            this.form = { ...configs.configs } as formData
            this.isSettingSaved = true
        }
        this.isPreloadingSavedConfig = false
    }

    async testConnection (): Promise<void> {
        const logger = new Logger(this.platform)
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].trim() === '' && idx !== 'port') {
                PluginToast.error(Lang.trans('form.error.required_all'))
                isFormValidated = false
                break
            }
        }

        if (isFormValidated) {
            const client = createClient(this.form.host + (this.form.port ? ':'+ this.form.port : ''), {
                authType: AuthType.Password,
                username: this.form.username,
                password: this.form.password,
            })
            this.isFormProcessing = true
            if (this.form.location !== '/') {
                this.form.location = this.form.location.endsWith('/')
                    ? this.form.location.substr(0, this.form.location.length - 1)
                    : this.form.location
            }
            const testFile = this.form.location + '/test.txt'

            try {
                await client.putFileContents(testFile, 'Test content', { overwrite: true })
                this.isFormProcessing = false
                this.isCheckLoginSuccess = true
                PluginToast.success(Lang.trans('sync.setting_valid'))
                await client.deleteFile(testFile)
            } catch (e) {
                this.isFormProcessing = false
                PluginToast.error(Lang.trans('sync.error_connection'))
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            }
        }
    }

    async saveSettings (): Promise<void> {
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.WEBDAV, this.form).then(result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(Lang.trans('settings.amazon.save_settings_failed'))
            } else {
                PluginToast.success(Lang.trans('settings.amazon.save_settings_success'))
                this.isSettingSaved = true
                this.isSyncingProgress = true
                SettingsHelper.syncWithCloud(this.config, this.platform, true).then(async (result: SyncResult) => {
                    if (result.result) {
                        this.config.requestRestart()
                    } else {
                        PluginToast.error(result.message || Lang.trans('sync.sync_server_failed'))
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

    async uploadLocalSettings (): Promise<void> {
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.WEBDAV, this.form).then(result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(Lang.trans('settings.amazon.save_settings_failed'))
            } else {
                this.isSettingSaved = true
                PluginToast.success(Lang.trans('settings.amazon.save_settings_success'))
                this.isSyncingProgress = true
                WebDav.syncLocalSettingsToCloud(this.platform).then(async (result: SyncResult) => {
                    if (result.result) {
                        this.config.requestRestart()
                    } else {
                        PluginToast.error(result.message || Lang.trans('sync.sync_server_failed'))
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
