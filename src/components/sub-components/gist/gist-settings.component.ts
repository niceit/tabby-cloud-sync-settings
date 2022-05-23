// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncLang from '../../../data/lang'
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
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

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
        { value: 'github', name: 'Github' },
        // { value: 'gitee', name: 'Gitee' }, // TODO Tran Implement
        { value: 'gitlab', name: 'Gitlab' },
        // { value: 'bitbucket', name: 'Bitbucket' }, // TODO Tran Implement
    ]
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.GIST] as formData

    constructor (private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {

    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs) {
            if (configs.adapter === this.presetData.values.GIST) {
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
            if (this.form[idx].trim() === '' && !['name', 'id'].includes(idx)) {
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('form.error.required_all'),
                    type: 'error',
                })
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
                    $component.testConnection(this.platform, this.createGistIfNotExist).then(response => {
                        this.isFormProcessing = false
                        console.info('Test Result', response)
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
                            this.isCheckLoginSuccess = true
                            if (!this.form.id) {
                                this.form.id = response.data.id
                            }
                        }
                    }).catch((err) => {
                        console.log('error | ', err)
                        this.isFormProcessing = false
                    })
                } else {
                    this.setFormMessage.emit({
                        message: CloudSyncLang.trans('gist.invalid_provider'),
                        type: 'success',
                    })
                }
            } catch (e) {
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: CloudSyncLang.trans('sync.error_connection'),
                    type: 'error',
                })
                logger.log(CloudSyncLang.trans('log.error_test_connection') + ' | Exception: ' + e.toString(), 'error')
            }
        }
    }

    async saveSettings (): Promise<void> {
        this.resetFormMessages.emit()
        this.isFormProcessing = true
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.GIST, this.form).then(async result => {
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
                        this.resetFormMessages.emit()
                        this.setFormMessage.emit({
                            message: typeof subResult !== 'boolean' && subResult['message']
                                ? subResult['message']
                                : CloudSyncLang.trans('sync.sync_server_failed'),
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
            this.toast.error(this.translate.trans('gist.enter_id'))
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
