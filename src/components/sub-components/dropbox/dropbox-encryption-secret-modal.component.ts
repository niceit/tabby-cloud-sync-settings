import { Component, ElementRef, Input, ViewChild } from '@angular/core'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'
import CloudSyncLang from '../../../data/lang'

@Component({
    template: require('./dropbox-encryption-secret-modal.component.pug'),
    styles: [require('./dropbox-encryption-secret-modal.component.scss')],
})
export class DropboxEncryptionSecretModalComponent {
    @Input() verifySecret: (secret: string) => Promise<void>
    @ViewChild('secretInput') secretInput: ElementRef

    translate = CloudSyncLang
    secret = ''
    showSecret = false
    isProcessing = false
    errorMessage = ''

    constructor (public modalInstance: NgbActiveModal) { }

    ngOnInit (): void {
        setTimeout(() => this.secretInput?.nativeElement.focus())
    }

    toggleSecretVisibility (): void {
        this.showSecret = !this.showSecret
    }

    async submit (): Promise<void> {
        if (!this.secret || this.isProcessing || !this.verifySecret) {
            return
        }

        this.isProcessing = true
        this.errorMessage = ''
        try {
            await this.verifySecret(this.secret)
            this.secret = ''
            this.modalInstance.close(true)
        } catch (error) {
            this.errorMessage = error.message || this.translate.trans('dropbox.encryption_secret_invalid')
            this.secretInput?.nativeElement.focus()
            this.secretInput?.nativeElement.select()
        } finally {
            this.isProcessing = false
        }
    }

    cancel (): void {
        if (this.isProcessing) {
            return
        }
        this.secret = ''
        this.modalInstance.dismiss('cancelled')
    }
}
