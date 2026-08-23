/**
 * A single process-wide lock shared by the auto-sync loop, the config-change
 * listener and every cloud adapter.
 *
 * Previously each adapter kept its own module-level `isSyncingInProgress`
 * boolean and `index.ts` kept a separate `autoSynInProgress` flag. Because they
 * were independent, a scheduled push could silently no-op while the cycle still
 * reported success. One lock removes that class of bug.
 */
class SyncLock {
    private locked = false
    private owner: string = null
    private acquiredAt = 0

    /**
     * Safety valve: if a lock is somehow never released (an adapter throwing
     * outside its `try`, a hung socket) we would stop syncing forever. After
     * this many milliseconds the lock is considered stale and can be taken.
     */
    private static readonly STALE_AFTER_MS = 120000

    /** Whether a sync is currently running. */
    get isLocked (): boolean {
        return this.locked && !this.isStale()
    }

    /** Name of the operation currently holding the lock, if any. */
    get currentOwner (): string {
        return this.isLocked ? this.owner : null
    }

    /** True when the current holder has held the lock beyond the stale timeout. */
    private isStale (): boolean {
        return this.locked && Date.now() - this.acquiredAt > SyncLock.STALE_AFTER_MS
    }

    /**
     * Try to take the lock.
     *
     * @param owner Label describing the caller, used in log output.
     * @returns `true` when the lock was acquired, `false` when a sync is
     *  already running and the caller should back off.
     */
    acquire (owner: string): boolean {
        if (this.isLocked) {
            return false
        }

        this.locked = true
        this.owner = owner
        this.acquiredAt = Date.now()
        return true
    }

    /** Release the lock. Safe to call when not held. */
    release (): void {
        this.locked = false
        this.owner = null
        this.acquiredAt = 0
    }

    /**
     * Run `fn` while holding the lock, releasing it even if `fn` throws.
     *
     * @returns The result of `fn`, or `fallback` when the lock was unavailable.
     */
    async runExclusive<T> (owner: string, fn: () => Promise<T>, fallback: T): Promise<T> {
        if (!this.acquire(owner)) {
            return fallback
        }

        try {
            return await fn()
        } finally {
            this.release()
        }
    }
}

export default new SyncLock()
