import { Component, EventEmitter, NgZone, OnDestroy, OnInit } from '@angular/core'
import CloudSyncSettingsData from '../../../data/setting-items'
import SettingsHelper from '../../../utils/settings-helper'
import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncLang from '../../../data/lang'
import PluginToast from '../../../services/toast'
import Logger from '../../../utils/Logger'
import { Dropbox } from 'dropbox'
import { version } from '../../../../package.json'
import { randomBytes } from 'crypto'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { DropboxEncryptionSecretModalComponent } from './dropbox-encryption-secret-modal.component'

const DROPBOX_CALLBACK_HOST = 'localhost'
const DROPBOX_CALLBACK_PORT = 53682
const DROPBOX_CALLBACK_PATH = '/dropbox/callback'
const DROPBOX_CALLBACK_URI = `http://${DROPBOX_CALLBACK_HOST}:${DROPBOX_CALLBACK_PORT}${DROPBOX_CALLBACK_PATH}`
const DROPBOX_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

@Component({
    selector: 'dropbox-settings',
    template: require('./dropbox-settings.component.pug'),
    styles: [require('./dropbox-settings.component.scss')],
})
export class CloudSyncDropboxSettingsComponent implements OnInit, OnDestroy {
    private dropboxServiceEmitter = new EventEmitter()
    private dbx: Dropbox
    private callbackServer: Server
    private callbackTimeout: ReturnType<typeof setTimeout>
    private oauthState = ''


    translate = CloudSyncLang
    presetData = CloudSyncSettingsData

    connectedData = {
        isConnected: false,
        accessToken: '',
        location: '',
        refreshToken: '',
        email: '',
        lastErrorMessage: ''
    }

    isConnecting = false
    isFormProcessing = false
    isSettingSaved = false
    isSaveSettingErrored = false
    isAutomaticCallbackAvailable = false
    showManualCallbackFallback = false
    callbackUrl = ''


    get connectedLabel (): string {
        return CloudSyncLang.trans('dropbox.connected', { email: this.connectedData.email })
    }

    get lastSyncErrorLabel (): string {
        return CloudSyncLang.trans('dropbox.last_sync_error', { message: this.connectedData.lastErrorMessage })
    }

    constructor (
        private config: ConfigService,
        private platform: PlatformService,
        private ngZone: NgZone,
        private ngbModal: NgbModal
    ) {
        const logger = new Logger(this.platform)
        const dropboxForm = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX]
        const diagnostics = this.getCredentialDiagnostics()

        logger.log({
            event: 'dropbox-provider-initialized',
            ...diagnostics,
        })

        if (!dropboxForm.apiKey) {
            logger.log({
                event: 'dropbox-provider-app-key-unavailable',
                reason: 'The compiled DROPBOX_APP_KEY is empty. A saved unexpired access token may continue syncing, but new authorization and token refresh require a correctly built plugin.',
                ...diagnostics,
            }, 'warn')
        } else {
            this.dbx = new Dropbox({ clientId: dropboxForm.apiKey })
        }
    }

    /** Returns diagnostics safe for logs; the credential value is never included. */
    private getCredentialDiagnostics (): {
        pluginVersion: string
        buildId: string
        appKeyPresent: boolean
        appKeyLength: number
    } {
        const dropboxForm = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX]
        const appKey = typeof dropboxForm?.apiKey === 'string' ? dropboxForm.apiKey.trim() : ''

        return {
            pluginVersion: version,
            buildId: process.env.TABBY_CLOUD_SYNC_BUILD_ID || 'unknown',
            appKeyPresent: appKey.length > 0,
            appKeyLength: appKey.length,
        }
    }

    /** Redacts OAuth values that an SDK error might include in a URL or payload. */
    private sanitizeDiagnosticText (value: string): string {
        return value
            .replace(/([?&](?:code|code_verifier|access_token|refresh_token|client_secret)=)[^&\s]+/gi, '$1[REDACTED]')
            .replace(/("(?:code|code_verifier|access_token|refresh_token|client_secret)"\s*:\s*")[^"]+/gi, '$1[REDACTED]')
            .replace(/(authorization:\s*bearer\s+)\S+/gi, '$1[REDACTED]')
    }

    /** Normalizes unknown SDK errors without logging request or token payloads. */
    private getErrorDiagnostics (error: any): {
        errorName: string
        errorMessage: string
        errorStack?: string
    } {
        const message = typeof error?.message === 'string' ? error.message : String(error)
        return {
            errorName: typeof error?.name === 'string' ? error.name : 'Error',
            errorMessage: this.sanitizeDiagnosticText(message),
            errorStack: typeof error?.stack === 'string' ? this.sanitizeDiagnosticText(error.stack) : undefined,
        }
    }

    /** Creates a URL-safe state value used to bind the callback to this login attempt. */
    private createOAuthState (): string {
        return randomBytes(32)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
    }

    private isOAuthStateValid (state: string): boolean {
        return !!this.oauthState && state === this.oauthState
    }

    /** Starts the temporary loopback server before the browser authorization begins. */
    private startCallbackServer (): Promise<boolean> {
        this.stopCallbackServer()
        const logger = new Logger(this.platform)

        return new Promise((resolve) => {
            let settled = false
            const server = createServer((request, response) => {
                this.processLoopbackCallback(request, response).catch((error) => {
                    const errorDiagnostics = this.getErrorDiagnostics(error)
                    logger.log({
                        event: 'dropbox-callback-processing-failed',
                        ...this.getCredentialDiagnostics(),
                        ...errorDiagnostics,
                    }, 'error')
                    this.stopCallbackServer()
                    this.ngZone.run(() => {
                        this.isAutomaticCallbackAvailable = false
                        this.showManualCallbackFallback = true
                        PluginToast.error(errorDiagnostics.errorMessage)
                    })
                    this.writeLoopbackResponse(
                        response,
                        500,
                        'Dropbox connection failed',
                        'Tabby could not process the Dropbox callback. Return to Tabby for details.'
                    )
                })
            })
            this.callbackServer = server

            const handleStartupError = (error: any): void => {
                const errorDiagnostics = this.getErrorDiagnostics(error)
                logger.log({
                    event: 'dropbox-callback-listener-start-failed',
                    callbackUri: DROPBOX_CALLBACK_URI,
                    ...this.getCredentialDiagnostics(),
                    ...errorDiagnostics,
                }, 'error')

                if (this.callbackServer === server) {
                    this.callbackServer = null
                }

                this.ngZone.run(() => {
                    this.isAutomaticCallbackAvailable = false
                    this.showManualCallbackFallback = true
                })

                if (!settled) {
                    settled = true
                    resolve(false)
                }
            }

            server.once('error', handleStartupError)
            server.listen(DROPBOX_CALLBACK_PORT, DROPBOX_CALLBACK_HOST, () => {
                server.removeListener('error', handleStartupError)
                server.on('error', (error) => {
                    logger.log({
                        event: 'dropbox-callback-listener-error',
                        callbackUri: DROPBOX_CALLBACK_URI,
                        ...this.getCredentialDiagnostics(),
                        ...this.getErrorDiagnostics(error),
                    }, 'error')
                })

                this.ngZone.run(() => {
                    this.isAutomaticCallbackAvailable = true
                    this.showManualCallbackFallback = false
                })

                this.callbackTimeout = setTimeout(() => {
                    this.ngZone.run(() => {
                        logger.log({
                            event: 'dropbox-callback-listener-timeout',
                            callbackUri: DROPBOX_CALLBACK_URI,
                            ...this.getCredentialDiagnostics(),
                        }, 'warn')
                        this.stopCallbackServer()
                        this.isAutomaticCallbackAvailable = false
                        this.showManualCallbackFallback = true
                        PluginToast.error(CloudSyncLang.trans('dropbox.callback_timeout'))
                    })
                }, DROPBOX_CALLBACK_TIMEOUT_MS)

                logger.log({
                    event: 'dropbox-callback-listener-started',
                    callbackUri: DROPBOX_CALLBACK_URI,
                    timeoutSeconds: DROPBOX_CALLBACK_TIMEOUT_MS / 1000,
                    ...this.getCredentialDiagnostics(),
                })

                if (!settled) {
                    settled = true
                    resolve(true)
                }
            })
        })
    }

    private stopCallbackServer (): void {
        if (this.callbackTimeout) {
            clearTimeout(this.callbackTimeout)
            this.callbackTimeout = null
        }

        const server = this.callbackServer
        this.callbackServer = null
        if (server?.listening) {
            server.close()
        }
    }

    private async processLoopbackCallback (request: IncomingMessage, response: ServerResponse): Promise<void> {
        const logger = new Logger(this.platform)
        const callback = new URL(request.url || '/', DROPBOX_CALLBACK_URI)

        if (request.method !== 'GET' || callback.pathname !== DROPBOX_CALLBACK_PATH) {
            this.writeLoopbackResponse(response, 404, 'Not found', 'This local callback endpoint only accepts Dropbox authorization responses.')
            return
        }

        const state = callback.searchParams.get('state') || ''
        if (!this.isOAuthStateValid(state)) {
            logger.log({
                event: 'dropbox-callback-state-rejected',
                statePresent: state.length > 0,
                stateLength: state.length,
                ...this.getCredentialDiagnostics(),
            }, 'warn')
            this.writeLoopbackResponse(response, 400, 'Invalid Dropbox callback', 'The callback could not be verified. Return to Tabby and start the connection again.')
            return
        }

        const oauthError = callback.searchParams.get('error')
        if (oauthError) {
            const errorDescription = callback.searchParams.get('error_description') || oauthError
            this.stopCallbackServer()
            this.ngZone.run(() => {
                this.isConnecting = false
                this.isAutomaticCallbackAvailable = false
                PluginToast.error(errorDescription)
            })
            logger.log({
                event: 'dropbox-callback-oauth-error',
                oauthError,
                ...this.getCredentialDiagnostics(),
            }, 'error')
            this.writeLoopbackResponse(response, 400, 'Dropbox authorization was not completed', 'Return to Tabby and try connecting again.')
            return
        }

        const code = callback.searchParams.get('code') || ''
        if (!code) {
            this.writeLoopbackResponse(response, 400, 'Missing authorization code', 'Dropbox did not include an authorization code. Return to Tabby and try again.')
            return
        }

        this.stopCallbackServer()
        const connected = await this.ngZone.run(() => this.completeAuthentication(code, 'automatic'))
        this.writeLoopbackResponse(
            response,
            connected ? 200 : 500,
            connected ? 'Dropbox connected' : 'Dropbox connection failed',
            connected
                ? 'Dropbox is connected. You can close this tab and return to Tabby.'
                : 'Tabby could not complete the Dropbox connection. Return to Tabby for details.'
        )
    }

    private writeLoopbackResponse (
        response: ServerResponse,
        statusCode: number,
        title: string,
        message: string
    ): void {
        if (response.headersSent) {
            response.end()
            return
        }

        response.writeHead(statusCode, {
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
            'Content-Type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff',
        })
        response.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#101010;color:#eee;max-width:680px;margin:15vh auto;padding:32px}h1{font-size:28px}p{font-size:18px;line-height:1.6;color:#bbb}</style></head><body><h1>${title}</h1><p>${message}</p></body></html>`)
    }

    /** Exchanges a verified callback code and loads the connected Dropbox account. */
    private async completeAuthentication (code: string, callbackSource: 'automatic' | 'manual'): Promise<boolean> {
        const logger = new Logger(this.platform)
        const dbx = this.dbx
        if (!dbx || !code) {
            PluginToast.error(CloudSyncLang.trans('dropbox.callback_invalid'))
            return false
        }

        this.isFormProcessing = true
        logger.log({
            event: 'dropbox-auth-callback-received',
            callbackSource,
            authorizationCodePresent: true,
            authorizationCodeLength: code.length,
            ...this.getCredentialDiagnostics(),
        })

        let token: any
        try {
            // @ts-ignore
            token = await dbx.auth.getAccessTokenFromCode(DROPBOX_CALLBACK_URI, code)
            // @ts-ignore
            dbx.auth.setRefreshToken(token.result.refresh_token)
        } catch (error) {
            const errorDiagnostics = this.getErrorDiagnostics(error)
            logger.log({
                event: 'dropbox-token-exchange-failed',
                callbackSource,
                ...this.getCredentialDiagnostics(),
                ...errorDiagnostics,
            }, 'error')
            PluginToast.error(errorDiagnostics.errorMessage)
            this.isFormProcessing = false
            this.isConnecting = false
            return false
        }

        try {
            const account = await dbx.usersGetCurrentAccount()
            PluginToast.success(CloudSyncLang.trans('dropbox.connect_success'))
            this.connectedData.isConnected = true
            this.connectedData.accessToken = token.result.access_token
            this.connectedData.refreshToken = token.result.refresh_token
            this.connectedData.email = account.result.email
            this.isFormProcessing = false
            this.isConnecting = false
            this.isAutomaticCallbackAvailable = false
            this.showManualCallbackFallback = false
            this.callbackUrl = ''
            this.oauthState = ''
            this.stopCallbackServer()
            logger.log({
                event: 'dropbox-connect-completed',
                callbackSource,
                ...this.getCredentialDiagnostics(),
            })
            return true
        } catch (error) {
            const errorDiagnostics = this.getErrorDiagnostics(error)
            logger.log({
                event: 'dropbox-account-lookup-failed',
                callbackSource,
                ...this.getCredentialDiagnostics(),
                ...errorDiagnostics,
            }, 'error')
            PluginToast.error(errorDiagnostics.errorMessage)
            this.isFormProcessing = false
            this.isConnecting = false
            return false
        }
    }

    ngOnInit (): void {
        const configs = SettingsHelper.readConfigFile(this.platform)
        if (configs && configs.adapter === this.presetData.values.DROPBOX) {
            this.connectedData = { ...configs.configs }
            this.isSettingSaved = true

            new Logger(this.platform).log({
                event: 'dropbox-saved-session-restored',
                accessTokenPresent: !!this.connectedData.accessToken,
                refreshTokenPresent: !!this.connectedData.refreshToken,
                connectedEmailPresent: !!this.connectedData.email,
                ...this.getCredentialDiagnostics(),
            })
        }

        this.dropboxServiceEmitter.subscribe(async (event: { action: string, result: boolean, message?: string, remoteContent?: string }) => {
            if (event.action === 'dropbox-encryption-secret-required') {
                await this.requestEncryptionSecret(event.remoteContent || '')
                return
            }

            if (event.action === 'dropbox-sync-complete') {
                if (event.result) {
                    this.isSettingSaved = true
                    this.config.requestRestart()
                } else {
                    this.disconnect()
                    PluginToast.error(event.message)

                    this.isSettingSaved = false
                    this.isSaveSettingErrored = true
                    await SettingsHelper.removeConfirmFile(this.platform, false)
                }
            }
        })
    }

    async connect (): Promise<void> {
        const logger = new Logger(this.platform)
        const diagnostics = this.getCredentialDiagnostics()

        logger.log({
            event: 'dropbox-connect-requested',
            sdkInitialized: !!this.dbx,
            ...diagnostics,
        })

        if (!this.dbx) {
            const message = CloudSyncLang.trans('dropbox.missing_app_credentials')
            logger.log({
                event: 'dropbox-connect-blocked',
                reason: 'Dropbox SDK was not initialized because the compiled app key is unavailable.',
                ...diagnostics,
            }, 'error')
            PluginToast.error(message)
            return
        }

        this.oauthState = this.createOAuthState()
        this.callbackUrl = ''
        this.isConnecting = true
        this.isAutomaticCallbackAvailable = false
        this.showManualCallbackFallback = false

        const listenerStarted = await this.startCallbackServer()

        try {
            // @ts-ignore
            const authUrl = await this.dbx.auth.getAuthenticationUrl(DROPBOX_CALLBACK_URI, this.oauthState, 'code', 'offline', null, 'none', true)
            logger.log({
                event: 'dropbox-auth-url-created',
                redirectUri: DROPBOX_CALLBACK_URI,
                authUrlPresent: !!authUrl,
                statePresent: this.oauthState.length > 0,
                automaticCallbackAvailable: listenerStarted,
                ...diagnostics,
            })
            this.platform.openExternal(authUrl)
        } catch (error) {
            const errorDiagnostics = this.getErrorDiagnostics(error)
            this.stopCallbackServer()
            logger.log({
                event: 'dropbox-auth-url-failed',
                ...diagnostics,
                ...errorDiagnostics,
            }, 'error')
            PluginToast.error(errorDiagnostics.errorMessage)
            this.isConnecting = false
            this.isAutomaticCallbackAvailable = false
        }
    }

    async handleAuthCallback (): Promise<void> {
        if (!this.callbackUrl) {
            PluginToast.error(CloudSyncLang.trans('dropbox.missing_callback_url'))
            return
        }

        let callback: URL
        try {
            callback = new URL(this.callbackUrl)
        } catch (error) {
            PluginToast.error(CloudSyncLang.trans('dropbox.callback_invalid'))
            return
        }

        const expectedCallback = new URL(DROPBOX_CALLBACK_URI)
        const state = callback.searchParams.get('state') || ''
        if (
            callback.origin !== expectedCallback.origin ||
            callback.pathname !== expectedCallback.pathname ||
            !this.isOAuthStateValid(state)
        ) {
            PluginToast.error(CloudSyncLang.trans('dropbox.callback_invalid'))
            return
        }

        const oauthError = callback.searchParams.get('error')
        if (oauthError) {
            PluginToast.error(callback.searchParams.get('error_description') || oauthError)
            return
        }

        const code = callback.searchParams.get('code') || ''
        if (!code) {
            PluginToast.error(CloudSyncLang.trans('dropbox.callback_invalid'))
            return
        }

        this.stopCallbackServer()
        await this.completeAuthentication(code, 'manual')
    }

    private async requestEncryptionSecret (remoteContent: string): Promise<void> {
        if (!remoteContent) {
            await this.cancelEncryptionUnlock()
            return
        }

        const modal = this.ngbModal.open(DropboxEncryptionSecretModalComponent, {
            backdrop: 'static',
            keyboard: false,
            size: 'sm',
        })
        const modalComponent = modal.componentInstance as DropboxEncryptionSecretModalComponent
        modalComponent.verifySecret = async (secret: string): Promise<void> => {
            await SettingsHelper.unlockCustomEncryptionSecret(this.platform, remoteContent, secret)
        }

        const unlocked = await modal.result.catch(() => false)
        if (!unlocked) {
            await this.cancelEncryptionUnlock()
            return
        }

        PluginToast.success(CloudSyncLang.trans('dropbox.encryption_secret_saved'))
        await SettingsHelper.syncWithCloud(this.config, this.platform, true, this.dropboxServiceEmitter)
    }

    private async cancelEncryptionUnlock (): Promise<void> {
        await SettingsHelper.removeConfirmFile(this.platform, false, false)
        this.disconnect()
        this.isSettingSaved = false
        this.isSaveSettingErrored = false
        this.isFormProcessing = false
    }

    async saveSettings (): Promise<void> {
        SettingsHelper.saveSettingsToFile(this.platform, CloudSyncSettingsData.values.DROPBOX, this.connectedData).then(result => {
            this.isFormProcessing = false
            if (!result) {
                PluginToast.error(CloudSyncLang.trans('settings.amazon.save_settings_failed'))
            } else {
                this.isSettingSaved = true
                PluginToast.success(CloudSyncLang.trans('settings.amazon.save_settings_success'))
                SettingsHelper.syncWithCloud(this.config, this.platform, true, this.dropboxServiceEmitter)
            }
        })
    }

    disconnect (): void {
        this.stopCallbackServer()
        this.oauthState = ''
        this.callbackUrl = ''
        this.connectedData.isConnected = false
        this.connectedData.accessToken = ''
        this.connectedData.refreshToken = ''
        this.connectedData.location = ''
        this.connectedData.email = ''
        this.connectedData.lastErrorMessage = ''
        this.isConnecting = false
        this.isFormProcessing = false
        this.isAutomaticCallbackAvailable = false
        this.showManualCallbackFallback = false

        const dropboxForm = CloudSyncSettingsData.formData[CloudSyncSettingsData.values.DROPBOX]
        this.dbx = dropboxForm.apiKey ? new Dropbox({ clientId: dropboxForm.apiKey }) : null
    }

    async disconnectSettings(): Promise<void> {
        if ((await this.platform.showMessageBox({
            type: 'warning',
            message: CloudSyncLang.trans('dropbox.confirm_disconnect'),
            buttons: [CloudSyncLang.trans('buttons.cancel'), CloudSyncLang.trans('buttons.disconnect')],
            defaultId: 0,
        })).response === 1) {
            await SettingsHelper.removeConfirmFile(this.platform, false)
            this.disconnect()
            this.config.requestRestart()
        }
    }

    cancelConnect (): void {
        this.stopCallbackServer()
        this.oauthState = ''
        this.isConnecting = false
        this.isAutomaticCallbackAvailable = false
        this.showManualCallbackFallback = false
    }

    enableManualCallback (): void {
        this.showManualCallbackFallback = true
    }

    ngOnDestroy (): void {
        this.stopCallbackServer()
    }

    async pasteFromClipboard (): Promise<void> {
        const logger = new Logger(this.platform)
        try {
            const text = await navigator.clipboard.readText()
            this.callbackUrl = text
            PluginToast.success(CloudSyncLang.trans('dropbox.clipboard_success'))
        } catch (err) {
            PluginToast.error(CloudSyncLang.trans('dropbox.clipboard_error'))
            logger.log('Failed to read clipboard contents: ' + err.toString(), 'error')
        }
    }
}
