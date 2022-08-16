// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import {Component, HostBinding, OnInit} from '@angular/core'
import { ConfigService, PlatformService, BaseComponent } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncSettingsData from '../data/setting-items'
import Lang from '../data/lang'
import SettingsHelper from '../utils/settings-helper'

/** @hidden */
@Component({
    template: require('./cloud-sync-settings.component.pug'),
    styles: [require('./cloud-sync-settings.component.scss')],
})

export class CloudSyncSettingsComponent extends BaseComponent implements OnInit {
    translate = Lang
    serviceProviderValues = CloudSyncSettingsData.values
    serviceProviders = CloudSyncSettingsData.serviceProvidersList
    selectedProvider: any = ''

    form_messages = {
        errors: [],
        success: [],
    }
    syncEnabled = false
    storedSettingsData = null

    form: any = CloudSyncSettingsData.formData

    @HostBinding('class.content-box') true
    constructor (
        public config: ConfigService,
        private toast: ToastrService,
        private platform: PlatformService
    ) {
      super()
    }

    ngOnInit (): void {
        this.storedSettingsData = SettingsHelper.readConfigFile(this.platform)
        if (this.storedSettingsData) {
            this.selectedProvider = this.storedSettingsData.adapter
            this.syncEnabled = this.storedSettingsData.enabled
        } else {
            this.selectedProvider = this.serviceProviderValues.S3
        }
    }

    onSelectProviderChange (): void {
        this.resetFormMessages()
    }

    toggleEnableSync (): void {
        SettingsHelper.toggleEnabledPlugin(this.syncEnabled, this.platform, this.toast).then(() => {})
    }

    resetFormMessages (): void {
        this.form_messages.errors = []
        this.form_messages.success = []
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
