import { Component, OnInit } from '@angular/core'
import CloudSyncLang from '../../data/lang'

@Component({
    selector: 'master-password-form',
    template: require('./master-password.component.pug'),
    styles: [require('./master-password.component.scss')],
})
export class MasterPasswordComponent implements OnInit {
    translate = CloudSyncLang
    form = {
        password: '',
        reTypePassword: '',
    }
    ngOnInit (): void {
        // do nothing
    }
}
