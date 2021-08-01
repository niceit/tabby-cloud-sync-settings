import { Component, OnInit } from '@angular/core'
import { ConfigService, PlatformService } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import { PasswordStorageService } from 'services/PasswordStorage.service'
import CloudSyncSettingsData from '../data/setting-items'
import Lang from '../data/lang'
import SettingsHelper from "../utils/settings-helper";

/** @hidden */
@Component({
    template: require('./cloud-sync-settings.component.pug'),
    styles: [require('./cloud-sync-settings.component.scss')],
})

export class CloudSyncSettingsComponent implements OnInit {
    translate = Lang
    presetData = CloudSyncSettingsData
    serviceProviderValues = CloudSyncSettingsData.values
    serviceProviders = CloudSyncSettingsData.serviceProvidersList
    selectedProvider: any = ''

    form_messages = {
        errors: [],
        success: [],
    }
    storedSettingsData = {}

    form: any = CloudSyncSettingsData.formData


    constructor (
        public config: ConfigService,
        private toastr: ToastrService,
        private platform: PlatformService,
        private passwordStorage: PasswordStorageService
    ) {
    }

    ngOnInit (): void {
        const fs = require('fs')
        fs.readFile(SettingsHelper.settingPathFile, 'utf8' , (err, data) => {
            if (!err && data) {
                try {
                    const value = JSON.parse(data)
                    this.selectedProvider = value.adapter
                } catch (e) {
                    this.selectedProvider = this.serviceProviderValues.BUILT_IN
                }
            } else {
                this.selectedProvider = this.serviceProviderValues.BUILT_IN
            }
        })
    }

    onSelectProviderChange (): void {
        this.resetFormMessages()
    }

    performCheckPluginUpdate (): void {

    }

    resetFormMessages (): void {
        this.form_messages.errors = []
        this.form_messages.success = []
    }

    setFormMessage (params: any): void {
        switch (params.type) {
            case 'success': {
                this.form_messages.success.push(params.message)
                break
            }

            case 'error': {
                this.form_messages.errors.push(params.message)
                break
            }
        }
    }
}
