/**
 * Self-contained toast notifications for the Cloud Sync Settings plugin.
 *
 * Why not reuse Tabby's `ToastrService`? Two reasons:
 *
 *  1. Isolation. Tabby configures a single global `ToastrModule` with
 *     `positionClass: 'toast-bottom-center'` and `toastClass: 'toast'`, and
 *     restyles `#toast-container` in `app/src/toastr.scss`. Anything the plugin
 *     pushed through that service inherited those choices, and any styling the
 *     plugin added would have leaked into Tabby's own notifications.
 *  2. Reach. Toasts are raised from plain singletons (`settings-helper`, the
 *     cloud adapters) that live outside Angular's injector, so an injectable
 *     service had to be threaded through as a parameter on ~30 method
 *     signatures just to be available.
 *
 * This module renders its own container into `document.body` and injects its own
 * stylesheet, both under `tabby-cloud-sync-*` / `.tcss-toast*` names, so it
 * cannot collide with Tabby's `#toast-container` or with Bootstrap's `.toast`.
 * Every colour is stated explicitly rather than inherited, so a Tabby theme
 * change can never render a message unreadable.
 */

export type PluginToastType = 'success' | 'error' | 'warning' | 'info'

export interface PluginToastOptions {
    /** Milliseconds before the toast dismisses itself. `0` keeps it until clicked. */
    timeout?: number
    /** Optional bold line rendered above the message. */
    title?: string
}

const CONTAINER_ID = 'tabby-cloud-sync-toasts'
const STYLE_ID = 'tabby-cloud-sync-toast-styles'

/** Default lifetime of a toast. Errors get a longer one — see {@link TIMEOUTS}. */
const DEFAULT_TIMEOUT = 5000

const TIMEOUTS: Record<PluginToastType, number> = {
    success: 4000,
    info: 4000,
    warning: 7000,
    error: 9000,
}

const ICONS: Record<PluginToastType, string> = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    warning: 'fas fa-exclamation-triangle',
    info: 'fas fa-info-circle',
}

/** How many toasts may be on screen at once; the oldest is dropped beyond this. */
const MAX_VISIBLE = 5

/** Must match the `.tcss-toast--leaving` transition duration below. */
const LEAVE_ANIMATION_MS = 220

const STYLES = `
#${CONTAINER_ID} {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 10600;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    max-width: min(420px, calc(100vw - 40px));
    max-height: calc(100vh - 40px);
    transition: bottom 0.2s ease-out;
    pointer-events: none;
}

/*
 * The sync indicator (\`.tabby-sync-loading\`, 40px, pinned 24px from the same
 * corner) is on screen at exactly the moment sync toasts are raised, so the
 * stack is lifted clear of it — but only while it is actually visible, so
 * toasts otherwise sit flush against the bottom edge. Both elements are direct
 * children of \`body\` and the loader is injected first, at module construction,
 * so the sibling combinator holds.
 */
.tabby-sync-loading.active ~ #${CONTAINER_ID} {
    bottom: 72px;
    max-height: calc(100vh - 92px);
}

#${CONTAINER_ID} .tcss-toast {
    pointer-events: auto;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    border-radius: 6px;
    border-left: 3px solid transparent;
    background-color: #22252b;
    color: #e8eaed;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    line-height: 1.45;
    cursor: pointer;
    animation: tcss-toast-in 0.22s ease-out;
}

#${CONTAINER_ID} .tcss-toast--leaving {
    opacity: 0;
    transform: translateX(12px);
    transition: opacity ${LEAVE_ANIMATION_MS}ms ease-in, transform ${LEAVE_ANIMATION_MS}ms ease-in;
}

#${CONTAINER_ID} .tcss-toast__icon {
    flex: 0 0 auto;
    margin-top: 1px;
    font-size: 13px;
}

#${CONTAINER_ID} .tcss-toast__body {
    flex: 1 1 auto;
    min-width: 0;
    overflow-wrap: anywhere;
}

#${CONTAINER_ID} .tcss-toast__title {
    font-weight: 600;
    margin-bottom: 2px;
}

#${CONTAINER_ID} .tcss-toast__close {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    opacity: 0.5;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
}

#${CONTAINER_ID} .tcss-toast__close:hover {
    opacity: 1;
}

#${CONTAINER_ID} .tcss-toast--success {
    border-left-color: #2f9e6f;
}
#${CONTAINER_ID} .tcss-toast--success .tcss-toast__icon {
    color: #4fc08d;
}

#${CONTAINER_ID} .tcss-toast--error {
    border-left-color: #c0392b;
}
#${CONTAINER_ID} .tcss-toast--error .tcss-toast__icon {
    color: #ef6c5d;
}

#${CONTAINER_ID} .tcss-toast--warning {
    border-left-color: #c99a2e;
}
#${CONTAINER_ID} .tcss-toast--warning .tcss-toast__icon {
    color: #e9b949;
}

#${CONTAINER_ID} .tcss-toast--info {
    border-left-color: #3b7dd8;
}
#${CONTAINER_ID} .tcss-toast--info .tcss-toast__icon {
    color: #6ea8f5;
}

@keyframes tcss-toast-in {
    from { opacity: 0; transform: translateX(16px); }
    to { opacity: 1; transform: translateX(0); }
}
`

interface LiveToast {
    key: string
    element: HTMLElement
    timer: any
}

class PluginToastService {
    private container: HTMLElement = null
    private live: LiveToast[] = []

    /** Show a success message. */
    success (message: string, options?: PluginToastOptions): void {
        this.show('success', message, options)
    }

    /** Show an error message. */
    error (message: string, options?: PluginToastOptions): void {
        this.show('error', message, options)
    }

    /** Show a warning message. */
    warning (message: string, options?: PluginToastOptions): void {
        this.show('warning', message, options)
    }

    /** Show a neutral, informational message. */
    info (message: string, options?: PluginToastOptions): void {
        this.show('info', message, options)
    }

    /**
     * Render a toast in the bottom-right corner.
     *
     * Repeating a message that is already on screen restarts its timer instead
     * of stacking a duplicate, which matters because several code paths report
     * the same validation failure (e.g. "Please fill in all the fields.") on
     * every keystroke-triggered revalidation.
     */
    show (type: PluginToastType, message: string, options: PluginToastOptions = {}): void {
        const text = (message ?? '').toString().trim()
        if (!text) {
            return
        }

        const container = this.ensureContainer()
        if (!container) {
            return
        }

        const key = `${type}:${options.title ?? ''}:${text}`
        const timeout = options.timeout ?? TIMEOUTS[type] ?? DEFAULT_TIMEOUT

        const existing = this.live.find(item => item.key === key)
        if (existing) {
            this.scheduleDismiss(existing, timeout)
            return
        }

        const element = this.buildElement(type, text, options.title)
        container.appendChild(element)

        const entry: LiveToast = { key, element, timer: null }
        this.live.push(entry)
        element.addEventListener('click', () => this.dismiss(entry))
        this.scheduleDismiss(entry, timeout)

        while (this.live.length > MAX_VISIBLE) {
            this.dismiss(this.live[0])
        }
    }

    /** Dismiss every visible toast immediately. */
    clear (): void {
        for (const entry of [...this.live]) {
            this.dismiss(entry)
        }
    }

    private buildElement (type: PluginToastType, text: string, title?: string): HTMLElement {
        const element = document.createElement('div')
        element.className = `tcss-toast tcss-toast--${type}`
        element.setAttribute('role', type === 'error' ? 'alert' : 'status')

        const icon = document.createElement('i')
        icon.className = `tcss-toast__icon ${ICONS[type]}`
        icon.setAttribute('aria-hidden', 'true')
        element.appendChild(icon)

        const body = document.createElement('div')
        body.className = 'tcss-toast__body'
        if (title) {
            const titleElement = document.createElement('div')
            titleElement.className = 'tcss-toast__title'
            titleElement.textContent = title
            body.appendChild(titleElement)
        }
        const messageElement = document.createElement('div')
        messageElement.textContent = text
        body.appendChild(messageElement)
        element.appendChild(body)

        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'tcss-toast__close'
        close.setAttribute('aria-label', 'Dismiss')
        close.innerHTML = '&times;'
        element.appendChild(close)

        return element
    }

    private scheduleDismiss (entry: LiveToast, timeout: number): void {
        if (entry.timer) {
            clearTimeout(entry.timer)
            entry.timer = null
        }

        if (timeout > 0) {
            entry.timer = setTimeout(() => this.dismiss(entry), timeout)
        }
    }

    private dismiss (entry: LiveToast): void {
        const index = this.live.indexOf(entry)
        if (index === -1) {
            return
        }
        this.live.splice(index, 1)

        if (entry.timer) {
            clearTimeout(entry.timer)
            entry.timer = null
        }

        entry.element.classList.add('tcss-toast--leaving')
        setTimeout(() => entry.element.remove(), LEAVE_ANIMATION_MS)
    }

    /**
     * Create the container and stylesheet on first use. Both are looked up by
     * id first so a plugin reload cannot leave two containers behind.
     */
    private ensureContainer (): HTMLElement {
        if (typeof document === 'undefined') {
            return null
        }

        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style')
            style.id = STYLE_ID
            style.textContent = STYLES
            document.head.appendChild(style)
        }

        if (!this.container?.isConnected) {
            this.container = document.getElementById(CONTAINER_ID)
        }

        if (!this.container) {
            const container = document.createElement('div')
            container.id = CONTAINER_ID
            container.setAttribute('aria-live', 'polite')
            document.body.appendChild(container)
            this.container = container
        }

        return this.container
    }
}

export default new PluginToastService()
