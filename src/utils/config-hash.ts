import { PlatformService } from 'terminus-core'
import CloudSyncSettingsData from '../data/setting-items'
import * as yaml from 'js-yaml'

const fs = require('fs')
const path = require('path')
const CryptoJS = require('crypto-js')

/**
 * Content fingerprinting used to decide whether the local and cloud configs
 * actually differ.
 *
 * This lives in its own module (rather than in `settings-helper` or
 * `sync-utils`) so both of those can use it without importing each other.
 */

/**
 * Recursively rebuild a value with object keys in a stable order.
 *
 * Arrays keep their order because it is meaningful in the Tabby config (profile
 * lists, group ordering); only mapping keys are sorted.
 */
function canonicalise (value: any): any {
    if (Array.isArray(value)) {
        return value.map(canonicalise)
    }

    if (value && typeof value === 'object') {
        const sorted = {}
        for (const key of Object.keys(value).sort()) {
            sorted[key] = canonicalise(value[key])
        }
        return sorted
    }

    return value
}

/**
 * Fingerprint config content so two sides can be compared by value.
 *
 * The YAML is parsed and re-serialised in a canonical form before hashing, so
 * two configs that mean the same thing hash the same even when their formatting
 * differs. That matters because Tabby rewrites `config.yaml` through its own
 * `js-yaml` dump after every change: comparing raw text would report a
 * difference after each pull and trigger a pointless push back to the cloud.
 * Content that is not valid YAML falls back to a whitespace-normalised text
 * hash.
 *
 * Note that comparing the *encrypted* payloads would never work:
 * `CryptoJS.AES.encrypt` salts every call, so identical input produces
 * different ciphertext each time.
 */
export function hashConfigContent (content: string): string {
    if (!content) {
        return ''
    }

    let payload = content.replace(/\r\n/g, '\n').trim()
    try {
        payload = JSON.stringify(canonicalise(yaml.load(payload)))
    } catch (e) {
        // Not parseable as YAML: hash the normalised text instead. A caller
        // comparing two unparseable documents still gets a usable answer.
    }

    return CryptoJS.SHA256(payload).toString(CryptoJS.enc.Hex)
}

/** Hash of the Tabby config currently on disk, or `''` when it cannot be read. */
export function getLocalConfigHash (platform: PlatformService): string {
    const filePath = path.dirname(platform.getConfigPath()) + CloudSyncSettingsData.tabbySettingsFilename
    try {
        return hashConfigContent(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
        return ''
    }
}

/** First 8 characters of a hash, enough to correlate log lines. */
export function shortHash (hash: string): string {
    return hash ? hash.substr(0, 8) : 'none'
}
