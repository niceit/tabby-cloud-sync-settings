import { Component, OnInit } from '@angular/core'

@Component({
    selector: 'master-password-form',
    template: require('./master-password.component.pug'),
    styles: [require('./master-password.component.scss')],
})
export class MasterPasswordComponent implements OnInit {
    form = {
        password: '',
        reTypePassword: '',
    }
    ngOnInit (): void {
        // do nothing
    }
}
