import { Component, OnInit } from '@angular/core'
import axios from 'axios'

@Component({
    selector: 'cloud-sync-feedback-form',
    template: require('./feedback.component.pug'),
    styles: [require('./feedback.component.scss')],
})
export class CloudSyncFeedbackComponent implements OnInit {
    requestUrl = 'https://tabby-api.tranit.co/submit-feedback'
    requestSubscribeUrl = 'https:/tabby-api.tranit.co/subsribe-newsletter'
    isFormProcessing = false
    isFormSubscribeProcessing = false
    form_messages = {
        errors: [],
        success: [],
    }
    form_subscribe_messages = {
        errors: [],
        success: [],
    }
    form = {
        subject: '',
        name: '',
        email: '',
        message: '',

    }
    newLetterForm = {
        email: '',
    }

    calculationGenerateObj = {
        left: 0,
        right: 0,
        answer: '',
        correctedAnswer: '',
    }

    ngOnInit (): void {
        this.setCaptchaCalculation()
    }

    setCaptchaCalculation (): void {
        this.calculationGenerateObj.left = Math.floor(Math.random() * 99)
        this.calculationGenerateObj.right = Math.floor(Math.random() * 99)
        this.calculationGenerateObj.correctedAnswer = (this.calculationGenerateObj.left + this.calculationGenerateObj.right).toString()
        this.calculationGenerateObj.answer = ''
    }

    resetForm (): void {
        this.form = {
            subject: '',
            name: '',
            email: '',
            message: '',
        }
        this.newLetterForm = {
            email: '',
        }
        this.setCaptchaCalculation()
    }
    resetFormMessages (): void {
        this.form_messages.errors = []
        this.form_messages.success = []
        this.form_subscribe_messages.errors = []
        this.form_subscribe_messages.success = []
    }

    async subscribeNewsletter (): Promise<void> {
        this.resetFormMessages()
        if (!this.newLetterForm.email) {
            this.form_subscribe_messages.errors.push('Please enter your email')
            return
        }

        this.isFormSubscribeProcessing = true
        const bodyFormData = new FormData()
        bodyFormData.append('email', this.newLetterForm.email)
        await axios.post(this.requestSubscribeUrl, bodyFormData, {
            timeout: 30000,
        }).then((data) => {
            this.isFormSubscribeProcessing = false
            if (data.data.status) {
                this.form_subscribe_messages.success.push(data.data.message)
                this.resetForm()
                this.setCaptchaCalculation()
            } else {
                this.form_subscribe_messages.errors.push(data.data.message)
            }
        }).catch(e => {
            this.isFormSubscribeProcessing = false
            this.form_subscribe_messages.errors.push(e.message)
        })
    }

    async submitFeedback (): Promise<void> {
        this.resetFormMessages()
        if (!this.form.subject || !this.form.name || !this.form.email || !this.form.message) {
            this.form_messages.errors.push('Please fill all fields')
            return
        }
        if (this.calculationGenerateObj.answer !== this.calculationGenerateObj.correctedAnswer) {
            this.form_messages.errors.push('Please solve the correct calculation')
            return
        }

        this.isFormProcessing = true
        const bodyFormData = new FormData()
        bodyFormData.append('subject', this.form.subject)
        bodyFormData.append('name', this.form.name)
        bodyFormData.append('email', this.form.email)
        bodyFormData.append('message', this.form.message)
        await axios.post(this.requestUrl, bodyFormData, {
            timeout: 30000,
        }).then((data) => {
            this.isFormProcessing = false
            if (data.data.status) {
                this.form_messages.success.push(data.data.message)
                this.resetForm()
                this.setCaptchaCalculation()
            } else {
                this.form_messages.errors.push(data.data.message)
            }
        }).catch(e => {
            this.isFormProcessing = false
            this.form_messages.errors.push(e.message)
        })
    }
}
