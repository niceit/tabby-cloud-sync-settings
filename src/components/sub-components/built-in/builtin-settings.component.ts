import { Component, EventEmitter, OnInit, Output } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'

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
    @Output() resetFormMessages = new EventEmitter()
    @Output() setFormMessage = new EventEmitter()

    presetData = CloudSyncSettingsData
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
        this.resetFormMessages.emit()
        this.isCheckLoginSuccess = false
    }
}
