import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import Lang from '../../../data/lang'
import SettingsHelper from '../../../utils/settings-helper'
import {ConfigService, PlatformService} from "terminus-core"
import {ToastrService} from "ngx-toastr"
import CloudSyncLang from "../../../data/lang"
import Logger from '../../../utils/Logger'
import Github from "../../../utils/cloud-components/gists/github";
import SettingItems from "../../../data/setting-items";

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
        { value: 'gitee', name: 'Gitee' },
        { value: 'gitlab', name: 'Giblab' },
        { value: 'bitbucket_snippet', name: 'Bitbucket Snippet' },
    ]
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.GIST] as formData

    constructor(private config: ConfigService, private platform: PlatformService, private toast: ToastrService) {

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

    toggleViewPassword() {
        this.passwordFieldType = this.passwordFieldType === 'password' ? 'text' : 'password';
    }

    async testConnection (): Promise<void> {
        const logger = new Logger(this.platform)
        this.resetFormMessages.emit()
        let isFormValidated = true
        for (const idx in this.form) {
            if (this.form[idx].trim() === '' && ['name', 'id'].indexOf(idx) < 0) {
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
            try {
                let $component = null
                switch (this.form.type) {
                    case 'github': {
                        $component = new Github(this.form.id, this.form.accessToken)
                        break;
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
                                message: Lang.trans('settings.amazon.connected'),
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
                        message: Lang.trans('gist.invalid_provider'),
                        type: 'success',
                    })
                }
            } catch (e) {
                this.isFormProcessing = false
                this.setFormMessage.emit({
                    message: Lang.trans('sync.error_connection'),
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
                        this.resetFormMessages.emit()
                        this.setFormMessage.emit({
                            message: Lang.trans('sync.sync_server_failed'),
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

    viewGistUrl() {
        if (this.form.id) {
            this.platform.openExternal(SettingItems.gistUrls.viewItems.github + this.form.id)
        } else {
            this.toast.error(this.translate.trans('gist.enter_id'))
        }
    }
}
