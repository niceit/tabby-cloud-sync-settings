export interface AmazonParams {
    endpointUrl: string,
    appId: string,
    appSecret: string,
    bucket: string,
    region: string,
    location: string,
}

export interface FtpParams {
    protocol: string,
    host: string,
    username: string,
    password: string,
    location: string,
}

export interface GistParams {
    type: string,
    name: string,
    id: string,
    accessToken: string
}

export interface WebDavParams {
    host: string,
    username: string,
    password: string,
    location: string,
    port: string,
}

export interface DropboxParams {
    isConnected?: boolean,
    accessToken: string,
    refreshToken: string,
    location: string,
    email?: string,
    lastErrorMessage?: string,
}

export interface ConnectionGroup {
    name: string,
    collapsed: boolean,
    type: string
}

/**
 * Shape of the encrypted `sync-settings.json` file persisted next to the
 * Tabby config. `configs` holds the provider-specific credentials/options.
 */
export interface StoredSettings {
    adapter: string,
    enabled: boolean,
    showLoader: boolean,
    interval_insync: number,
    configs: any,
}

/**
 * Normalized result returned by every cloud adapter's `sync` /
 * `syncLocalSettingsToCloud` call so callers no longer need to guard against
 * a bare boolean return value.
 */
export interface SyncResult {
    result: boolean,
    message: string,
}
