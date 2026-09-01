const keytar = require('keytar')

export const SYNC_SECRET_SERVICE = 'tabby-cloud-sync-settings'
export const SYNC_SECRET_ACCOUNT = 'encryption-passphrase'

/** OS keychain storage for the optional V2 sync passphrase. */
class SettingsSecretStore {
    private cachedSecret: string = null
    private loaded = false
    private loadPromise: Promise<string> = null

    async load (): Promise<string> {
        if (this.loaded) {
            return this.cachedSecret
        }
        if (!this.loadPromise) {
            this.loadPromise = this.readFromKeychain()
        }
        return this.loadPromise
    }

    private async readFromKeychain (): Promise<string> {
        try {
            const secret = await keytar.getPassword(SYNC_SECRET_SERVICE, SYNC_SECRET_ACCOUNT)
            this.cachedSecret = typeof secret === 'string' && secret.length > 0 ? secret : null
        } catch (_) {
            this.cachedSecret = null
        } finally {
            this.loaded = true
            this.loadPromise = null
        }
        return this.cachedSecret
    }

    get (): string {
        return this.cachedSecret
    }

    async set (secret: string): Promise<boolean> {
        if (this.hasSecret()) {
            throw new Error('A custom encryption secret is already active and cannot be replaced.')
        }
        if (!secret || secret.length < 12) {
            throw new Error('The sync secret must be at least 12 characters long.')
        }

        try {
            await keytar.setPassword(SYNC_SECRET_SERVICE, SYNC_SECRET_ACCOUNT, secret)
            this.cachedSecret = secret
            this.loaded = true
            return true
        } catch (error) {
            this.cachedSecret = null
            throw new Error('Could not store the sync secret in the operating system keychain.')
        }
    }

    async clear (): Promise<boolean> {
        try {
            await keytar.deletePassword(SYNC_SECRET_SERVICE, SYNC_SECRET_ACCOUNT)
            this.cachedSecret = null
            this.loaded = true
            return true
        } catch (_) {
            return false
        }
    }

    hasSecret (): boolean {
        return !!this.cachedSecret
    }
}

export default new SettingsSecretStore()
