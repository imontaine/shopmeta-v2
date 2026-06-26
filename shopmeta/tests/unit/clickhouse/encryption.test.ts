// tests/unit/clickhouse/encryption.test.ts
// Unit tests for AES-256-GCM encryption roundtrip.
// These run without any database or network access.

import { describe, test, expect } from 'vitest'
import { encrypt, decrypt, encryptPassword, decryptPassword } from '#/lib/crypto'

const SECRET_KEY = 'test-secret-key-for-unit-tests-!!'  // 33 chars → SHA-256 derived

describe('AES-256-GCM encryption roundtrip', () => {
  // ─── Spec example (from 06-clickhouse-connections.md) ─────────────────────

  test('encrypt and decrypt are symmetric', () => {
    const password = 'my-secret-password'
    const encrypted = encrypt(password, SECRET_KEY)
    expect(encrypted).not.toBe(password)
    expect(decrypt(encrypted, SECRET_KEY)).toBe(password)
  })

  // ─── Ciphertext properties ──────────────────────────────────────────────────

  test('ciphertext is base64 encoded', () => {
    const cipher = encrypt('hello', SECRET_KEY)
    expect(() => Buffer.from(cipher, 'base64')).not.toThrow()
    // Valid base64 only contains these characters
    expect(cipher).toMatch(/^[A-Za-z0-9+/=]+$/)
  })

  test('ciphertext is not the same as plaintext', () => {
    const plain = 'super-secret-password'
    const cipher = encrypt(plain, SECRET_KEY)
    expect(cipher).not.toBe(plain)
    expect(cipher).not.toContain(plain)
  })

  test('ciphertext is longer than plaintext (IV + tag overhead)', () => {
    const plain = 'pass'
    const cipher = encrypt(plain, SECRET_KEY)
    // base64(12 IV + 16 tag + 4 plaintext) = base64(32) = 44 chars
    expect(cipher.length).toBeGreaterThan(plain.length)
  })

  test('encrypted output includes IV (each call produces different ciphertext)', () => {
    const plain = 'same-password'
    const cipher1 = encrypt(plain, SECRET_KEY)
    const cipher2 = encrypt(plain, SECRET_KEY)
    // Due to random IV, two encryptions of the same plaintext must differ
    expect(cipher1).not.toBe(cipher2)
    // But both must decrypt to the same value
    expect(decrypt(cipher1, SECRET_KEY)).toBe(plain)
    expect(decrypt(cipher2, SECRET_KEY)).toBe(plain)
  })

  // ─── Various key formats ────────────────────────────────────────────────────

  test('works with a 32-char passphrase (SHA-256 derived)', () => {
    const key = 'a'.repeat(32) // exactly 32 UTF-8 bytes
    const plain = 'test-value'
    const cipher = encrypt(plain, key)
    expect(decrypt(cipher, key)).toBe(plain)
  })

  test('works with a 64-char hex key', () => {
    const hexKey = '0'.repeat(64) // 64 hex chars = 32 bytes
    const plain = 'another-test'
    const cipher = encrypt(plain, hexKey)
    expect(decrypt(cipher, hexKey)).toBe(plain)
  })

  test('works with a short passphrase (SHA-256 derived)', () => {
    const key = 'short'
    const plain = 'value'
    const cipher = encrypt(plain, key)
    expect(decrypt(cipher, key)).toBe(plain)
  })

  // ─── Special characters ─────────────────────────────────────────────────────

  test('handles unicode passwords', () => {
    const plain = 'pässwörd-🔑-安全'
    const cipher = encrypt(plain, SECRET_KEY)
    expect(decrypt(cipher, SECRET_KEY)).toBe(plain)
  })

  test('handles empty string', () => {
    const plain = ''
    const cipher = encrypt(plain, SECRET_KEY)
    expect(decrypt(cipher, SECRET_KEY)).toBe(plain)
  })

  test('handles long passwords', () => {
    const plain = 'x'.repeat(10_000)
    const cipher = encrypt(plain, SECRET_KEY)
    expect(decrypt(cipher, SECRET_KEY)).toBe(plain)
  })

  test('handles passwords with special characters', () => {
    const plain = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\'
    const cipher = encrypt(plain, SECRET_KEY)
    expect(decrypt(cipher, SECRET_KEY)).toBe(plain)
  })

  // ─── Authentication / tamper detection ─────────────────────────────────────

  test('decrypt throws on tampered ciphertext (auth tag mismatch)', () => {
    const cipher = encrypt('original', SECRET_KEY)
    // Flip a byte in the ciphertext portion
    const bytes = Buffer.from(cipher, 'base64')
    bytes[bytes.length - 1] ^= 0xff
    const tampered = bytes.toString('base64')
    expect(() => decrypt(tampered, SECRET_KEY)).toThrow()
  })

  test('decrypt throws on wrong key', () => {
    const cipher = encrypt('secret', SECRET_KEY)
    expect(() => decrypt(cipher, 'wrong-key-completely-different!!')).toThrow()
  })

  test('decrypt throws on empty/invalid input', () => {
    expect(() => decrypt('', SECRET_KEY)).toThrow()
    expect(() => decrypt('not-valid-base64!!!', SECRET_KEY)).toThrow()
  })

  test('decrypt throws when ciphertext is too short', () => {
    // Less than IV(12) + tag(16) = 28 bytes minimum
    const tooShort = Buffer.from('shor').toString('base64') // 4 bytes
    expect(() => decrypt(tooShort, SECRET_KEY)).toThrow('too short')
  })

  // ─── Convenience aliases ────────────────────────────────────────────────────

  test('encryptPassword / decryptPassword are aliases for encrypt / decrypt', () => {
    const plain = 'alias-test-password'
    const cipher = encryptPassword(plain, SECRET_KEY)
    expect(cipher).not.toBe(plain)
    expect(decryptPassword(cipher, SECRET_KEY)).toBe(plain)
  })

  // ─── ClickHouse password example (realistic) ───────────────────────────────

  test('realistic ClickHouse password encrypts and decrypts correctly', () => {
    const chPassword = 'MySecureClickHouse$Pass123!'
    const encKey = 'production-encryption-key-32char'
    const cipher = encrypt(chPassword, encKey)

    // Ciphertext must not contain the password
    expect(cipher).not.toContain(chPassword)

    // Roundtrip
    expect(decrypt(cipher, encKey)).toBe(chPassword)
  })
})
