import { PlatformService } from 'terminus-core'
import CloudSyncSettingsData from '../data/setting-items'
import { StoredSettings } from '../interface'

const fs = require('fs')
const path = require('path')

/**
 * Record of the last successful sync for a single provider.
 *
 * `hash` is the fingerprint of the *decrypted* config content that both sides
 * agreed on. It is the baseline the next cycle compares against to work out
 * which side actually changed, instead of guessing from timestamps alone.
 */
export interface SyncBaseline {
    /** Hash of the plain config content that was last synced successfully. */
    hash: string,
    /** ISO-8601 remote modified time observed at that point, when known. */
    remoteUpdatedAt: string,
    /** ISO-8601 time at which this baseline was recorded. */
    syncedAt: string,
}

/**
 * Persists a per-provider "last synced" baseline next to the Tabby config.
 * Resolve the key under which a provider's baseline is stored.
 *
 * Usually just the stored adapter id, but every gist flavour shares the single
 * `gists` adapter, so the gist type is appended to stop a GitHub baseline from
 * being applied to a GitLab snippet after the user switches provider.
 */
export function resolveBaselineKey (savedConfigs: StoredSettings): string {
    if (!savedConfigs?.adapter) {
        return ''
    }

    if (savedConfigs.adapter === CloudSyncSettingsData.values.GIST) {
        return savedConfigs.adapter + ':' + (savedConfigs.configs?.type || 'gist')
    }

    return savedConfigs.adapter
}

/**
 * Persists a per-provider "last synced" baseline next to the Tabby config.
 *
 * This is deliberately a separate, unencrypted file: it holds nothing but
 * hashes and timestamps, and it is rewritten far more often than the
 * credentials file, which we do not want to churn.
 */
class SyncStateStore {
    private cache: Record<string, SyncBaseline> = null

    /** Absolute path of the sync-state file. */
    private getPath (platform: PlatformService): string {
        return path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.syncStateFilename
    }

    /** Load and memoise the whole state file, tolerating a missing/corrupt file. */
    private load (platform: PlatformService): Record<string, SyncBaseline> {
        if (this.cache) {
            return this.cache
        }

        this.cache = {}
        const filePath = this.getPath(platform)
        if (fs.existsSync(filePath)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
                if (parsed && typeof parsed === 'object') {
                    this.cache = parsed
                }
            } catch (e) {
                // Corrupt state file: start from scratch. Losing the baseline is
                // safe, it only means the next cycle falls back to timestamps.
            }
        }

        return this.cache
    }

    /** Flush the in-memory state to disk, swallowing write errors. */
    private persist (platform: PlatformService): void {
        try {
            fs.writeFileSync(this.getPath(platform), JSON.stringify(this.cache, null, 2))
        } catch (e) {
            // Non fatal: the baseline is an optimisation, not a requirement.
        }
    }

    /** Return the stored baseline for a provider, or `null` when there is none. */
    read (platform: PlatformService, adapterId: string): SyncBaseline {
        const state = this.load(platform)
        return state[adapterId] || null
    }

    /**
     * Record the content hash both sides now agree on.
     *
     * The write is skipped when nothing actually changed, so an idle install
     * does not rewrite the file on every polling cycle.
     */
    record (platform: PlatformService, adapterId: string, hash: string, remoteUpdatedAt: string = null): void {
        const state = this.load(platform)
        const existing = state[adapterId]
        if (existing && existing.hash === hash && existing.remoteUpdatedAt === (remoteUpdatedAt || null)) {
            return
        }

        state[adapterId] = {
            hash: hash,
            remoteUpdatedAt: remoteUpdatedAt || null,
            syncedAt: new Date().toISOString(),
        }
        this.persist(platform)
    }

    /**
     * Drop the baseline for one provider (or all of them), forcing the next
     * cycle back to the timestamp comparison. Used when the saved settings are
     * removed or replaced.
     */
    clear (platform: PlatformService, adapterId: string = null): void {
        const state = this.load(platform)
        if (adapterId) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete state[adapterId]
        } else {
            this.cache = {}
        }
        this.persist(platform)
    }
}

export default new SyncStateStore()
