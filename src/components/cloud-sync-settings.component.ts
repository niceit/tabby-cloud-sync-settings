import { compare as semverCompare } from 'semver'
import { Component, HostBinding, OnInit } from '@angular/core'
import { ConfigService, PlatformService, BaseComponent } from 'terminus-core'
import { ToastrService } from 'ngx-toastr'
import CloudSyncSettingsData from '../data/setting-items'
import Lang from '../data/lang'
import SettingsHelper from '../utils/settings-helper'
import axios from 'axios'
import { version } from '../../package.json'
import devConstants from '../services/dev-constants'
import { ConnectionGroup } from '../interface'
import Logger from "../utils/Logger";

/** @hidden */
@Component({
    template: require('./cloud-sync-settings.component.pug'),
    styles: [require('./cloud-sync-settings.component.scss')],
})

export class CloudSyncSettingsComponent extends BaseComponent implements OnInit {
    lastVersion = ''
    translate = Lang
    isUpdateAvailable = false
    isDebug = devConstants.ENABLE_DEBUG

    serviceProviderValues = CloudSyncSettingsData.values
    serviceProviders = CloudSyncSettingsData.serviceProvidersList
    selectedProvider = ''

    groups: ConnectionGroup[] = [
        {
            name: 'Exclusive Sponsor Cloud Services',
            collapsed: true,
            type: 'exclusive',
        },
        {
            name: 'Free Cloud Services',
            collapsed: false,
            type: 'free',
        },
    ]

    form_messages = {
        errors: [],
        success: [],
    }
    syncEnabled = false
    intervalSync = CloudSyncSettingsData.defaultSyncInterval
    storedSettingsData = null
    showBottomLoaderIcon = true
    form = CloudSyncSettingsData.formData

    @HostBinding('class.content-box') true
    constructor (
        public config: ConfigService,
        private toast: ToastrService,
        private platform: PlatformService
    ) {
        super()
    }

    ngOnInit (): void {
        this.checkForNewVersion().then()
        this.storedSettingsData = SettingsHelper.readConfigFile(this.platform)
        if (this.storedSettingsData) {
            this.selectedProvider = this.storedSettingsData.adapter
            this.syncEnabled = this.storedSettingsData.enabled
            this.intervalSync = this.storedSettingsData?.interval_insync || CloudSyncSettingsData.defaultSyncInterval
        } else {
            this.selectedProvider = this.serviceProviderValues.S3
        }
    }

    async checkForNewVersion (): Promise<void> {
        await axios.get(CloudSyncSettingsData.external_urls.checkForUpdateUrl, {
            timeout: 30000,
        }).then((response) => {
            const data = response.data
            if (semverCompare(version, data.version) === -1) {
                this.isUpdateAvailable = true
                this.lastVersion = data.version
            }
        })
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
