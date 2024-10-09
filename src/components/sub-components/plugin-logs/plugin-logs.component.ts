// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
import { Component, OnInit } from '@angular/core'
import { ConfigService, PlatformService } from 'terminus-core'
import { version } from '../../../../package.json'
import axios from 'axios'
import { compare as semverCompare } from 'semver'
import { TabbySyncUpgradeService } from '../../../services/tabby-sync-upgrade'
import CloudSyncSettingsData from '../../../data/setting-items'
import Logger from '../../../utils/Logger'
import moment from "moment";

interface LogItem {
    time: string,
    level: string,
    message: string
}

@Component({
    selector: 'plugin-logs',
    template: require('./plugin-logs.component.pug'),
    styles: [require('./plugin-logs.component.scss')],
})
export class PluginLogsComponent implements OnInit {
    logger = null

    queryDate = moment().format('DD-MM-YYYY')
    queryItemLimit = 1000

    items: LogItem[] = []
    isLoadingLogs = true
    isHavingError = false
    errorMessage = ''

    constructor (private platform: PlatformService) {
        this.logger = new Logger(this.platform)
        this.applyFilter()
    }

    ngOnInit (): void {
        // do nothing
    }

    applyFilter (): void {
        // moment check valid date input
        if (!moment(this.queryDate, 'DD-MM-YYYY').isValid()) {
            this.isHavingError = true
            this.errorMessage = 'Invalid date format. Please use DD-MM-YYYY'
            return
        }

        this.isHavingError = false
        this.errorMessage = ''
        this.isLoadingLogs = true
        this.items = []

        this.logger.getLogContents((err: any, result: any) => {
            if (err) {
                this.isHavingError = true
                this.errorMessage = err.message
            } else {
                this.items = result.file
            }

            console.log('LOGS', this.items)

            this.isLoadingLogs = false
        }, this.queryDate, this.queryItemLimit)
    }
}
