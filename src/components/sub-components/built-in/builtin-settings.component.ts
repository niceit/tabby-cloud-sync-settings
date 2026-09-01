import { Component, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import CloudSyncLang from '../../../data/lang'

interface formData {
    email: string,
    password: string,
    reset_password_email: string,
}

@Component({
    selector: 'builtin-settings',
    template: require('./builtin-settings.component.pug'),
    styles: [require('./builtin-settings.component.scss')],
})
export class CloudSyncBuiltinSettingsComponent implements OnInit {
    presetData = CloudSyncSettingsData
    translate = CloudSyncLang
    builtinLoginMode = CloudSyncSettingsData.BuiltinLoginMode.LOGIN
    isCheckLoginSuccess = false
    isFormProcessing = false
    form: formData = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.BUILT_IN] as formData

    ngOnInit (): void {

    }

    switchBetweenBuiltinLoginScreens (screenAlias: string): void {
        this.builtinLoginMode =  screenAlias
    }

    performLoginWithEmailPassword (): void {

    }

    cancelSaveSettings (): void {
        this.isCheckLoginSuccess = false
    }
}
