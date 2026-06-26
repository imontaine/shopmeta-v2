// src/lib/crypto.ts
// AES-256-GCM symmetric encryption for sensitive fields (e.g., ClickHouse passwords).
//
// Format: base64(iv [12 bytes] || authTag [16 bytes] || ciphertext)
// Key:    32-byte raw key derived from ENCRYPTION_KEY env var via SHA-256 if the
//         env var is not already 32 raw bytes (allows hex or passphrase input).
//
// Usage:
//   const cipher = encryptPassword('my-secret', process.env.ENCRYPTION_KEY!)
//   const plain  = decryptPassword(cipher, process.env.ENCRYPTION_KEY!)

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12       // 96-bit IV recommended for GCM
const TAG_LENGTH = 16      // 128-bit auth tag

/**
 * Derives a 32-byte key from any string input.
 * If the input is exactly 32 bytes (raw binary), it is used directly.
 * Otherwise SHA-256 is applied so any passphrase / hex string works.
 */
function deriveKey(keyMaterial: string): Buffer {
  const raw = Buffer.from(keyMaterial, 'utf8')
  if (raw.length === 32) return raw
  // Hex-encoded 64-char key
  if (keyMaterial.length === 64 && /^[0-9a-fA-F]+$/.test(keyMaterial)) {
    return Buffer.from(keyMaterial, 'hex')
  }
  // Passphrase → SHA-256
  return createHash('sha256').update(raw).digest()
}

/**
 * Encrypts `plaintext` using AES-256-GCM.
 * Returns a base64-encoded string: iv || authTag || ciphertext
 */
export function encrypt(plaintext: string, keyMaterial: string): string {
  const key = deriveKey(keyMaterial)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Layout: [12 bytes IV][16 bytes tag][N bytes ciphertext]
  const combined = Buffer.concat([iv, authTag, encrypted])
  return combined.toString('base64')
}

/**
 * Decrypts a base64-encoded AES-256-GCM blob produced by `encrypt`.
 * Throws if the ciphertext is tampered (authentication tag mismatch).
 */
export function decrypt(ciphertext: string, keyMaterial: string): string {
  const key = deriveKey(keyMaterial)
  const combined = Buffer.from(ciphertext, 'base64')

  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short')
  }

  const iv = combined.subarray(0, IV_LENGTH)
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/**
 * Returns the ENCRYPTION_KEY from environment, throwing a clear error if unset.
 * Server functions should call this rather than reading the env var directly.
 */
export function getEncryptionKey(): string {
  const key = process.env['ENCRYPTION_KEY']
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for ClickHouse password encryption. ' +
      'Set it to a secure random string (≥32 chars) in your .env file.',
    )
  }
  return key
}

// Convenience aliases matching the unit-test example in the spec
export { encrypt as encryptPassword, decrypt as decryptPassword }
