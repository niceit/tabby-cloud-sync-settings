import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import { SyncResult } from '../../../interface'
import Logger from '../../../utils/Logger'
import Github from '../../../utils/cloud-components/gists/github'
import Gitee from '../../../utils/cloud-components/gists/gitee'
import Gitlab from '../../../utils/cloud-components/gists/gitlab'

interface formData {
    type: string,
    name: string,
    accessToken: string,
    id: string,
}

@Component({
    selector: 'gist-settings',
    template: require('./gist-settings.component.pug'),
    styles: [require('./gist-settings.component.scss')],
})
export class CloudSyncGistSettingsComponent implements OnInit {
    translate = CloudSyncLang
    presetData = CloudSyncSettingsData
    isPreloadingSavedConfig = true
    isSettingSaved = false
    isCheckLoginSuccess = false
    createGistIfNotExist = true

    isSyncingProgress = false
    isFormProcessing = false

    passwordFieldType = 'password'
    gistTypeChoices = [
        { value: 'github', name: 'GitHub' },
        // { value: 'gitee', name: 'Gitee' }, // TODO Tran Implement
        { value: 'gitlab', name: 'GitLab' },
        // { value: 'bitbucket', name: 'Bitbucket' }, // TODO Tran Implement
    ]
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.GIST] as formData

    constructor (private config: ConfigService, private platform: PlatformService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.presetData.values.GIST) {
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
            if (this.form[idx].trim() === '' && !['name', 'id'].includes(idx)) {
                PluginToast.error(CloudSyncLang.trans('form.error.required_all'))
                isFormValidated = false
                break
            }
        }

        if (isFormValidated) {
            this.isFormProcessing = true
            try {
                let $component = null
                switch (this.form.type) {
                    case 'github': {
                        $component = new Github(this.form.id, this.form.accessToken)
                        break
                    }

                    case 'gitee': {
                        $component = new Gitee(this.form.id, this.form.accessToken)
                        break
                    }

                    case 'gitlab': {
                        $component = new Gitlab(this.form.id, this.form.accessToken)
                        break
                    }
                }

                if ($component) {
                    $component.testConnection(this.platform).then(response => {
                        this.isFormProcessing = false
                        if (response.hasOwnProperty('code') && parseInt(response.code) === 0) {
                            PluginToast.error(response.message)
                        } else {
                            PluginToast.success(CloudSyncLang.trans('settings.amazon.connected'))
                            this.isCheckLoginSuccess = true
                            if (!this.form.id) {
                                this.form.id = response.data.id
                            }
                        }
                    }).catch((err) => {
                        logger.log('Gist test connection error: ' + err.toString(), 'error')
                        this.isFormProcessing = false
                    })
                } else {
                    PluginToast.success(CloudSyncLang.trans('gist.invalid_provider'))
                }
            } catch (e) {
                this.isFormProcessing = false
                PluginToast.error(CloudSyncLang.trans('sync.error_connection'))
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            }
        }
    }

    async saveSettings (): Promise<void> {
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.GIST, this.form).then(async result => {
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
        // TODO Tran Remove git data
    }

    viewGistUrl (): void {
        if (this.form.id) {
            let platformViewUrl = CloudSyncSettingsData.gistUrls.viewItems.github
            switch (this.form.type) {
                case 'gitlab': {
                    platformViewUrl = CloudSyncSettingsData.gistUrls.viewItems.gitlab
                    break
                }
            }
            this.platform.openExternal(platformViewUrl + this.form.id)
        } else {
            PluginToast.error(this.translate.trans('gist.enter_id'))
        }
    }

    goToHelpLink (type: string): void {
        switch (type) {
            case 'github': {
                this.platform.openExternal(CloudSyncSettingsData.gistUrls.viewItems.github)
                break
            }

            case 'gitee': {
                this.platform.openExternal(CloudSyncSettingsData.gistUrls.viewItems.gitee)
                break
            }
        }
    }
}
