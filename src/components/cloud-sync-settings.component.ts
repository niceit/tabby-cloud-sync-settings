// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, HostBinding, OnInit } from '@angular/core'
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
    intervalSync = CloudSyncSettingsData.defaultSyncInterval
    storedSettingsData = null
    showBottomLoaderIcon = false

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
            this.intervalSync = this.storedSettingsData?.interval_insync || CloudSyncSettingsData.defaultSyncInterval
        } else {
            this.selectedProvider = this.serviceProviderValues.S3
        }
    }

    onSelectProviderChange (): void {
        this.resetFormMessages()
    }

    toggleEnableSync (): void {
        this.showBottomLoaderIcon = true
        SettingsHelper.toggleEnabledPlugin(this.syncEnabled, this.platform, this.toast).then((result) => {
            this.showBottomLoaderIcon = false
            if (result) {
                this.config.requestRestart()
            }
        })
    }

    onIntervalSyncChanged (): void {
        SettingsHelper.saveIntervalSync(this.intervalSync, this.platform, this.toast).then((result) => {
            this.showBottomLoaderIcon = false
            if (result) {
                this.config.requestRestart()
            }
        })
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
