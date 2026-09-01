import { ConfigService, PlatformService } from 'terminus-core'
import CloudSyncSettingsData from '../../data/setting-items'
import SettingsHelper from '../settings-helper'
import SyncState, { SyncBaseline } from '../sync-state'
import { hashConfigContent, getLocalConfigHash, shortHash } from '../config-hash'
import CloudSyncLang from '../../data/lang'
import Logger from '../Logger'
import moment from 'moment'
import * as yaml from 'js-yaml'
import path from 'path'
import fs from 'fs'

/** The concrete operation a sync cycle decided to perform. */
export type SyncAction = 'noop' | 'pull' | 'push' | 'conflict' | 'abort'

/**
 * Options describing how a single adapter should decide its sync direction.
 */
export interface SyncDirectionOptions {
    config: ConfigService,
    platform: PlatformService,
    logger: Logger,
    /** Human readable adapter name used in the log output. */
    providerLabel: string,
    /** Stored provider id, used to key the persisted sync baseline. */
    adapterId: string,
    /** Remote config `moment` timestamp, or `null` when it is unknown. */
    remoteUpdatedAt: moment.Moment | null,
    /** Raw (still encrypted) config content downloaded from the cloud. */
    remoteContent: string,
    /**
     * Callback invoked to push the local config to the cloud. May resolve to a
     * `SyncResult`, a bare boolean, or nothing; all three are understood.
     */
    pushToCloud: () => any,
}

/** Outcome of a sync cycle, reported back to the adapter and the UI. */
export interface SyncOutcome {
    action: SyncAction,
    result: boolean,
    message: string,
}

/**
 * Whether a failed remote read means "there is no config on the server yet"
 * rather than "the server could not be reached".
 *
 * The adapters used to upload the local config whenever *any* read error
 * occurred, so a transient 500 or a dropped connection silently published a
 * possibly stale local config over a good remote one. Only a genuine
 * not-found is safe to treat that way.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isRemoteMissingError (error: any): boolean {
    if (!error) {
        return false
    }

    const status = error.status || error.statusCode || error.response?.status
    if (status === 404) {
        return true
    }

    // S3 uses named codes; basic-ftp surfaces the numeric FTP reply code.
    const code = error.code
    if (code === 'NoSuchKey' || code === 'NotFound' || code === 'ENOENT' || code === 550) {
        return true
    }

    const message = (error.message || error.toString() || '').toLowerCase()
    return message.includes('not found')
        || message.includes('no such file')
        || message.includes('does not exist')
        || message.includes('nosuchkey')
}

/** Internal: the local side of the comparison. */
interface LocalSnapshot {
    content: string,
    hash: string,
    updatedAt: moment.Moment,
}

/**
 * Fingerprint config content so two sides can be compared by value.
 *
 * Re-exported from {@link hashConfigContent} so adapters only need to import
 * from this module.
 */
export { hashConfigContent }

/**
 * Replace the local Tabby config with `plain` YAML.
 *
 * The file is written first and only then handed to `ConfigService.writeRaw`,
 * because `writeRaw` starts an unawaited `save()` and `load()` in parallel: if
 * the `load()` reads the file before the `save()` has written it, Tabby's
 * in-memory store silently reverts to the previous config and the pull appears
 * to have been ignored.
 */
async function writeLocalConfig (config: ConfigService, platform: PlatformService, plain: string): Promise<void> {
    await SettingsHelper.writeTabbyConfigFile(platform, plain)
    config.writeRaw(plain)
}

/**
 * Apply a validated cloud config to the local file during the interactive
 * first-init flow, recording the baseline so the first background cycle sees
 * both sides as already in agreement.
 *
 * Without this the very next cycle would compare a fresh local mtime against
 * the older remote timestamp and immediately push back what was just pulled.
 */
export async function applyRemoteConfigOnFirstInit (
    config: ConfigService,
    platform: PlatformService,
    adapterId: string,
    remoteContent: string,
): Promise<void> {
    const remotePlain = SettingsHelper.doDescryption(remoteContent)
    await SettingsHelper.backupTabbyConfigFile(platform)
    await writeLocalConfig(config, platform, remotePlain)
    SyncState.record(platform, adapterId, hashConfigContent(remotePlain))
}

/**
 * Record the baseline after the interactive first-init flow pushed the local
 * config to the cloud, for the same reason as
 * {@link applyRemoteConfigOnFirstInit}.
 */
export function recordLocalBaselineOnFirstInit (platform: PlatformService, adapterId: string): void {
    SyncState.record(platform, adapterId, getLocalConfigHash(platform))
}

/** Read the local config file plus its modified time. */
async function readLocalSnapshot (platform: PlatformService): Promise<LocalSnapshot> {
    const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
    const stats = await fs.promises.stat(filePath)
    const content = await fs.promises.readFile(filePath, 'utf8')

    return {
        content: content,
        hash: hashConfigContent(content),
        updatedAt: moment(stats.mtime),
    }
}

/** Normalise the various shapes an adapter's push callback can resolve to. */
function normalisePushResult (value: any): { ok: boolean, message: string } {
    if (typeof value === 'boolean') {
        return { ok: value, message: '' }
    }

    if (value && typeof value === 'object' && 'result' in value) {
        return { ok: !!value.result, message: value.message || '' }
    }

    // Adapters whose upload helper resolves to nothing signal failure by
    // throwing, so reaching here means the upload completed.
    return { ok: true, message: '' }
}

/** Format a timestamp unambiguously for the log file. */
function formatForLog (value: moment.Moment | null): string {
    return value ? value.toISOString() : 'unknown'
}

/**
 * Whether decrypted content is a YAML mapping, i.e. something that could
 * plausibly be a Tabby config rather than a fragment of a truncated file.
 */
function isParseableConfig (plain: string): boolean {
    try {
        const parsed = yaml.load(plain)
        return !!parsed && typeof parsed === 'object'
    } catch (e) {
        return false
    }
}

/** ISO-8601 form of a timestamp for persistence, or `null` when unknown. */
function toIsoOrNull (value: moment.Moment | null): string {
    return value ? value.toISOString() : null
}

/**
 * Decide what to do when local and remote content differ.
 *
 * With a baseline we know which side moved, which is the only way to tell a
 * one-sided edit from a genuine two-sided conflict. Without one we fall back to
 * timestamps, but only when the gap is larger than the configured tolerance so
 * that clock skew and second-granularity remote timestamps (FTP `MDTM`, WebDav
 * `lastmod`) cannot decide the outcome on their own.
 */
export function isTrueConflict (localHash: string, remoteHash: string, baselineHash: string): boolean {
    return !!baselineHash && localHash !== baselineHash && remoteHash !== baselineHash
}

function decideAction (
    local: LocalSnapshot,
    remoteHash: string,
    remoteUpdatedAt: moment.Moment | null,
    baseline: SyncBaseline | null,
): { action: SyncAction, reason: string } {
    if (baseline?.hash) {
        const localChanged = local.hash !== baseline.hash
        const remoteChanged = remoteHash !== baseline.hash

        if (isTrueConflict(local.hash, remoteHash, baseline.hash)) {
            return { action: 'conflict', reason: 'both sides changed since the last sync' }
        }
        if (remoteChanged) {
            return { action: 'pull', reason: 'only the cloud changed since the last sync' }
        }
        if (localChanged) {
            return { action: 'push', reason: 'only the local config changed since the last sync' }
        }

        // Unreachable while the hashes differ, but keep the loop safe.
        return { action: 'noop', reason: 'no change detected against the baseline' }
    }

    if (!remoteUpdatedAt) {
        return {
            action: 'conflict',
            reason: 'no baseline and no remote timestamp available',
        }
    }

    const toleranceMs = CloudSyncSettingsData.syncSkewToleranceSeconds * 1000
    const deltaMs = remoteUpdatedAt.valueOf() - local.updatedAt.valueOf()

    if (deltaMs > toleranceMs) {
        return { action: 'pull', reason: `no baseline, cloud is newer by ${Math.round(deltaMs / 1000)}s` }
    }
    if (deltaMs < -toleranceMs) {
        return { action: 'push', reason: `no baseline, local is newer by ${Math.round(-deltaMs / 1000)}s` }
    }

    return {
        action: 'noop',
        reason: `no baseline and the timestamps are within the ${CloudSyncSettingsData.syncSkewToleranceSeconds}s tolerance`,
    }
}

/**
 * Pull the cloud config into the local file, keeping a backup of what was
 * replaced. The write is awaited so the caller still holds the sync lock when
 * Tabby emits its `changed$` notification.
 */
async function applyPull (options: SyncDirectionOptions, remotePlain: string, remoteHash: string): Promise<SyncOutcome> {
    const { config, platform, logger, adapterId, remoteUpdatedAt } = options

    await SettingsHelper.backupTabbyConfigFile(platform)
    // The baseline is recorded *before* the write so the `changed$` handler that
    // Tabby fires from `writeRaw` already sees the two sides as in agreement and
    // does not push the config straight back.
    SyncState.record(platform, adapterId, remoteHash, toIsoOrNull(remoteUpdatedAt))
    await writeLocalConfig(config, platform, remotePlain)
    logger.log('Sync direction: Cloud to local. Applied.')

    return { action: 'pull', result: true, message: '' }
}

/** Push the local config to the cloud and record the agreed hash on success. */
async function applyPush (options: SyncDirectionOptions, localHash: string): Promise<SyncOutcome> {
    const { platform, logger, adapterId, pushToCloud } = options

    const pushed = normalisePushResult(await pushToCloud())
    if (!pushed.ok) {
        logger.log('Sync direction: Local to Cloud. Upload failed. ' + pushed.message, 'error')
        return { action: 'push', result: false, message: pushed.message }
    }

    // The remote timestamp is now whatever the server stamped on the upload, so
    // it is deliberately left unknown until the next cycle observes it.
    SyncState.record(platform, adapterId, localHash)
    logger.log('Sync direction: Local To Cloud. Uploaded.')

    return { action: 'push', result: true, message: '' }
}

/**
 * Handle a genuine two-sided conflict.
 *
 * Nothing is discarded: the local file is copied to `config.yaml.backup` and
 * the cloud version is written next to it as `config.yaml.conflict-<epoch>`.
 * A true conflict is reported without changing either live side; an explicit
 * restore or future conflict-resolution flow can choose the winner safely.
 */
async function applyConflict (options: SyncDirectionOptions, remotePlain: string): Promise<SyncOutcome> {
    const { platform, logger, providerLabel } = options

    await SettingsHelper.backupTabbyConfigFile(platform)
    const snapshotPath = await SettingsHelper.writeConflictSnapshot(platform, remotePlain)
    const message = 'Sync conflict: both local and cloud configs changed. Resolve using the preserved snapshots.'
    logger.log(`Sync conflict on ${providerLabel}: local copy preserved in config.yaml.backup; cloud copy saved to ${snapshotPath || 'nowhere (write failed)'}. No winner selected.`, 'warn')

    return {
        action: 'conflict',
        result: false,
        message: message + (snapshotPath ? ' Cloud snapshot: ' + snapshotPath : ''),
    }
}

/**
 * Decide and perform the sync for one polling cycle.
 *
 * The algorithm is content-first: the decrypted cloud config is compared to the
 * local one by hash, so an unchanged install transfers nothing at all. This is
 * what stops the pull/push ping-pong the previous timestamp-only version was
 * guaranteed to produce, where writing the pulled file bumped the local mtime,
 * which made the next cycle push, which bumped the remote mtime, which made the
 * cycle after that pull again — forever.
 *
 * Timestamps are now only a tiebreaker for the very first cycle on a device,
 * and the remote payload is validated before it is ever allowed to overwrite
 * the local config.
 */
export async function resolveSyncDirection (options: SyncDirectionOptions): Promise<SyncOutcome> {
    const { platform, logger, providerLabel, adapterId, remoteUpdatedAt, remoteContent } = options

    let local: LocalSnapshot = null
    try {
        local = await readLocalSnapshot(platform)
    } catch (err) {
        logger.log('Unable to read local config file: ' + err.toString(), 'error')
        return { action: 'abort', result: false, message: err.toString() }
    }

    // Never overwrite a working config with something we cannot vouch for. The
    // first-init path has always checked this; the periodic path did not, which
    // meant a truncated or half-uploaded remote file could wipe the local one.
    if (!remoteContent || !SettingsHelper.verifyServerConfigIsValid(remoteContent)) {
        logger.log(`Auto Sync ${providerLabel}: cloud config is missing or not produced by this plugin. Refusing to overwrite the local config.`, 'error')
        return { action: 'abort', result: false, message: CloudSyncLang.trans('common.errors.invalidServerConfig') }
    }

    const remotePlain = SettingsHelper.doDescryption(remoteContent)
    if (!remotePlain.trim()) {
        logger.log(`Auto Sync ${providerLabel}: cloud config decrypted to an empty document. Refusing to overwrite the local config.`, 'error')
        return { action: 'abort', result: false, message: CloudSyncLang.trans('common.errors.invalidServerConfig') }
    }

    // The plugin header only proves who wrote the file, not that the payload
    // survived the trip. Parsing it here means a truncated upload or a botched
    // decryption can never reach `config.yaml`.
    if (!isParseableConfig(remotePlain)) {
        logger.log(`Auto Sync ${providerLabel}: cloud config is not valid YAML after decryption. Refusing to overwrite the local config.`, 'error')
        return { action: 'abort', result: false, message: CloudSyncLang.trans('common.errors.invalidServerConfig') }
    }

    const remoteHash = hashConfigContent(remotePlain)
    const baseline = SyncState.read(platform, adapterId)

    logger.log(`Auto Sync ${providerLabel} | cloud updated: ${formatForLog(remoteUpdatedAt)} | local updated: ${formatForLog(local.updatedAt)} | cloud hash: ${shortHash(remoteHash)} | local hash: ${shortHash(local.hash)} | baseline: ${shortHash(baseline?.hash)}`)

    if (remoteHash === local.hash) {
        // Both sides already agree, so refresh the baseline and do nothing else.
        SyncState.record(platform, adapterId, local.hash, toIsoOrNull(remoteUpdatedAt))
        logger.log('Sync direction: none. Local and cloud content are identical.')
        return { action: 'noop', result: true, message: '' }
    }

    const { action, reason } = decideAction(local, remoteHash, remoteUpdatedAt, baseline)
    logger.log(`Sync decision: ${action} (${reason}).`)

    switch (action) {
        case 'pull': {
            return applyPull(options, remotePlain, remoteHash)
        }

        case 'push': {
            return applyPush(options, local.hash)
        }

        case 'conflict': {
            return applyConflict(options, remotePlain)
        }

        default: {
            return { action: 'noop', result: true, message: '' }
        }
    }
}
