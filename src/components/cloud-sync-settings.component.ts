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
    syncEnabled = false
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
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs) {
            this.selectedProvider = configs.adapter
        } else {
            this.selectedProvider = this.serviceProviderValues.BUILT_IN
        }
        this.toastr.success("Test Toast")
    }

    onSelectProviderChange (): void {
        this.resetFormMessages()
    }

    toggleEnableSync(): void {

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
