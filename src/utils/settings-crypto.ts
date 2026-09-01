import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const CryptoJS = require('crypto-js')

/** The JSON envelope version used by the authenticated encryption format. */
export const ENCRYPTION_VERSION = 2

/**
 * The passphrase used by the original plugin encryption format.
 *
 * @deprecated V1 is retained only for decrypting and migrating existing data.
 * Use a user-provided passphrase with `encryptV2` for new data.
 */
export const LEGACY_ENCRYPTION_KEY = 'tp!&nc3^to8y7^3#4%2%&szufx!'

const V2_ALGORITHM = 'aes-256-gcm'
const V2_KDF = 'scrypt'
const V2_KEY_LENGTH = 32
const V2_SALT_LENGTH = 16
const V2_IV_LENGTH = 12
const V2_AUTH_TAG_LENGTH = 16
const V2_SCRYPT_COST = 16384
const V2_SCRYPT_BLOCK_SIZE = 8
const V2_SCRYPT_PARALLELIZATION = 1
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export interface V2EncryptionEnvelope {
    format: 'tabby-sync'
    version: 2
    algorithm: 'aes-256-gcm'
    kdf: 'scrypt'
    salt: string
    iv: string
    authTag: string
    ciphertext: string
    keyLength: 32
    cost: number
    blockSize: number
    parallelization: number
}

export type ParsedPayload = {
    format: 'v1'
    ciphertext: string
} | {
    format: 'v2'
    envelope: V2EncryptionEnvelope
}

function assertNonEmptyString (value: unknown, fieldName: string): asserts value is string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${fieldName} must be a non-empty string`)
    }
}

function decodeBase64 (value: unknown, fieldName: string): Buffer {
    assertNonEmptyString(value, fieldName)
    if (!BASE64_PATTERN.test(value) || value.length % 4 !== 0) {
        throw new Error(`${fieldName} must be valid base64`)
    }

    const decoded = Buffer.from(value, 'base64')
    if (decoded.length === 0 || decoded.toString('base64') !== value) {
        throw new Error(`${fieldName} must be valid base64`)
    }
    return decoded
}

function isV2Object (value: unknown): value is V2EncryptionEnvelope {
    return !!value && typeof value === 'object' &&
        (value as { version?: unknown }).version === ENCRYPTION_VERSION
}

/**
 * Returns true when a payload is a V2 envelope, including an envelope whose
 * fields are malformed. This lets callers fail closed instead of trying V1.
 */
export function isV2Payload (payload: string): boolean {
    if (typeof payload !== 'string') {
        return false
    }

    const trimmed = payload.trim()
    if (!trimmed.startsWith('{')) {
        return false
    }

    try {
        return isV2Object(JSON.parse(trimmed))
    } catch (_) {
        return /^\{\s*["'](?:format|version)["']\s*:\s*["']?tabby-sync|^\{\s*["']version["']\s*:\s*2(?:\s*,|\s*})/.test(trimmed)
    }
}

function parseEnvelope (payload: string): V2EncryptionEnvelope {
    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch (_) {
        throw new Error('V2 payload must be valid JSON')
    }

    if (!isV2Object(parsed)) {
        throw new Error('V2 payload must have version 2')
    }

    const envelope = parsed as Partial<V2EncryptionEnvelope>
    if (envelope.format !== 'tabby-sync' || envelope.algorithm !== V2_ALGORITHM || envelope.kdf !== V2_KDF) {
        throw new Error('Unsupported V2 encryption algorithm or key derivation function')
    }
    if (envelope.keyLength !== V2_KEY_LENGTH || envelope.cost !== V2_SCRYPT_COST ||
        envelope.blockSize !== V2_SCRYPT_BLOCK_SIZE || envelope.parallelization !== V2_SCRYPT_PARALLELIZATION) {
        throw new Error('Unsupported V2 encryption parameters')
    }

    const salt = decodeBase64(envelope.salt, 'salt')
    const iv = decodeBase64(envelope.iv, 'iv')
    const authTag = decodeBase64(envelope.authTag, 'authTag')
    const ciphertext = decodeBase64(envelope.ciphertext, 'ciphertext')
    if (salt.length !== V2_SALT_LENGTH || iv.length !== V2_IV_LENGTH || authTag.length !== V2_AUTH_TAG_LENGTH) {
        throw new Error('V2 payload has invalid binary field lengths')
    }

    return {
        format: 'tabby-sync',
        version: 2,
        algorithm: 'aes-256-gcm',
        kdf: 'scrypt',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        keyLength: 32,
        cost: V2_SCRYPT_COST,
        blockSize: V2_SCRYPT_BLOCK_SIZE,
        parallelization: V2_SCRYPT_PARALLELIZATION,
    }
}

/** Detects and validates the outer payload format without decrypting it. */
export function parsePayload (payload: string): ParsedPayload {
    assertNonEmptyString(payload, 'payload')
    if (isV2Payload(payload)) {
        return { format: 'v2', envelope: parseEnvelope(payload.trim()) }
    }
    return { format: 'v1', ciphertext: payload }
}

/**
 * Encrypts using the original CryptoJS passphrase AES format.
 * @deprecated Use `encryptV2` for new payloads.
 */
export function encryptV1 (plaintext: string): string {
    assertNonEmptyString(plaintext, 'plaintext')
    return CryptoJS.AES.encrypt(plaintext, LEGACY_ENCRYPTION_KEY).toString()
}

/**
 * Decrypts the original CryptoJS passphrase AES format.
 * @deprecated Use `decryptV2` for V2 payloads.
 */
export function decryptV1 (ciphertext: string): string {
    assertNonEmptyString(ciphertext, 'ciphertext')
    const plaintext = CryptoJS.AES.decrypt(ciphertext, LEGACY_ENCRYPTION_KEY).toString(CryptoJS.enc.Utf8)
    if (!plaintext) {
        throw new Error('V1 decryption failed or produced empty plaintext')
    }
    return plaintext
}

/** Encrypts non-empty plaintext with scrypt-derived AES-256-GCM. */
export function encryptV2 (plaintext: string, passphrase: string): string {
    assertNonEmptyString(plaintext, 'plaintext')
    assertNonEmptyString(passphrase, 'passphrase')

    const salt = randomBytes(V2_SALT_LENGTH)
    const iv = randomBytes(V2_IV_LENGTH)
    const key = scryptSync(passphrase, salt as any, V2_KEY_LENGTH, {
        N: V2_SCRYPT_COST,
        r: V2_SCRYPT_BLOCK_SIZE,
        p: V2_SCRYPT_PARALLELIZATION,
    })
    const cipher = createCipheriv(V2_ALGORITHM, key as any, iv as any)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8') as any, cipher.final() as any] as any)
    const envelope: V2EncryptionEnvelope = {
        format: 'tabby-sync',
        version: 2,
        algorithm: 'aes-256-gcm',
        kdf: 'scrypt',
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        keyLength: 32,
        cost: V2_SCRYPT_COST,
        blockSize: V2_SCRYPT_BLOCK_SIZE,
        parallelization: V2_SCRYPT_PARALLELIZATION,
    }
    return JSON.stringify(envelope)
}

/** Decrypts and authenticates a V2 JSON envelope. */
export function decryptV2 (payload: string, passphrase: string): string {
    assertNonEmptyString(passphrase, 'passphrase')
    const envelope = parseEnvelope(payload.trim())
    const key = scryptSync(passphrase, Buffer.from(envelope.salt, 'base64') as any, V2_KEY_LENGTH, {
        N: envelope.cost,
        r: envelope.blockSize,
        p: envelope.parallelization,
    })
    try {
        const decipher = createDecipheriv(V2_ALGORITHM, key as any, Buffer.from(envelope.iv, 'base64') as any)
        decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64') as any)
        const plaintext = Buffer.concat([
            decipher.update(Buffer.from(envelope.ciphertext, 'base64') as any) as any,
            decipher.final() as any,
        ]).toString('utf8')
        if (!plaintext) {
            throw new Error('V2 decryption produced empty plaintext')
        }
        return plaintext
    } catch (error) {
        if (error instanceof Error && error.message === 'V2 decryption produced empty plaintext') {
            throw error
        }
        throw new Error('V2 decryption failed: authentication failed or payload was tampered with')
    }
}

/** Decrypts V2 payloads strictly, falling back to V1 only for non-V2 data. */
export function decryptPayload (payload: string, passphrase: string = ''): string {
    const parsed = parsePayload(payload)
    return parsed.format === 'v2' ? decryptV2(payload, passphrase) : decryptV1(parsed.ciphertext)
}
