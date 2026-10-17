/**
 * Unit tests for push API access-control helpers.
 *
 * Covers:
 *   - validateEndpoint: allows approved push-endpoint hosts; rejects bad ones.
 *   - assertOwnUser:    allows own user or no claim; throws 403 for a different user.
 *
 * These helpers are the first line of defence in every push API route.
 * No network or Supabase calls are made.
 */

import { describe, it, expect } from 'vitest'
import { validateEndpoint, assertOwnUser } from '@/app/api/push/_access'
import { AccessError } from '@/lib/couple-access'

const ACCESS = { userId: 'uid1', userName: 'mateo' as const, coupleId: 'c1', stateId: 'sema' }

// ── validateEndpoint ──────────────────────────────────────────────────────────

describe('validateEndpoint — approved hosts', () => {
  it.each([
    ['FCM (Google)',         'https://fcm.googleapis.com/fcm/send/APA91b'],
    ['Mozilla (exact)',      'https://updates.push.services.mozilla.com/push/abc'],
    ['Mozilla (subdomain)',  'https://sub.push.services.mozilla.com/push/abc'],
    ['Apple WebPush',        'https://web.push.apple.com/push/abc'],
    ['Apple subdomain',      'https://sub.push.apple.com/push/abc'],
    ['Windows Notification', 'https://s1234.notify.windows.com/w/?token=abc'],
  ])('accepts %s endpoint', (_label, url) => {
    expect(() => validateEndpoint(url)).not.toThrow()
    expect(validateEndpoint(url)).toBe(url)
  })
})

describe('validateEndpoint — rejections', () => {
  it('rejects HTTP (not HTTPS)', () => {
    expect(() => validateEndpoint('http://fcm.googleapis.com/push/abc')).toThrow(AccessError)
  })

  it('rejects an unapproved host', () => {
    expect(() => validateEndpoint('https://evil.example.com/push/abc')).toThrow(AccessError)
  })

  it('rejects a string longer than 4096 characters', () => {
    const long = 'https://fcm.googleapis.com/' + 'a'.repeat(4100)
    expect(() => validateEndpoint(long)).toThrow(AccessError)
  })

  it('rejects a non-string value (number)', () => {
    expect(() => validateEndpoint(42)).toThrow(AccessError)
  })

  it('rejects null', () => {
    expect(() => validateEndpoint(null)).toThrow(AccessError)
  })

  it('rejects undefined', () => {
    expect(() => validateEndpoint(undefined)).toThrow(AccessError)
  })

  it('rejects an endpoint with embedded credentials', () => {
    expect(() =>
      validateEndpoint('https://user:pass@fcm.googleapis.com/push/abc'),
    ).toThrow(AccessError)
  })

  it('rejects an endpoint with a non-standard port', () => {
    expect(() =>
      validateEndpoint('https://fcm.googleapis.com:8443/push/abc'),
    ).toThrow(AccessError)
  })

  it('rejects an endpoint with a fragment (#)', () => {
    expect(() =>
      validateEndpoint('https://fcm.googleapis.com/push/abc#frag'),
    ).toThrow(AccessError)
  })
})

// ── assertOwnUser ─────────────────────────────────────────────────────────────

describe('assertOwnUser', () => {
  it('does not throw when value matches access.userName', () => {
    expect(() => assertOwnUser('mateo', ACCESS)).not.toThrow()
  })

  it('does not throw when value is undefined (no ownership claim)', () => {
    expect(() => assertOwnUser(undefined, ACCESS)).not.toThrow()
  })

  it('does not throw when value is null (no ownership claim)', () => {
    expect(() => assertOwnUser(null, ACCESS)).not.toThrow()
  })

  it('throws AccessError(403) when value is a different user', () => {
    let caught: unknown
    try { assertOwnUser('seval', ACCESS) } catch (e) { caught = e }
    expect(caught).toBeInstanceOf(AccessError)
    expect((caught as AccessError).status).toBe(403)
  })

  it('throws 403 for any non-matching string (case-sensitive)', () => {
    expect(() => assertOwnUser('MATEO', ACCESS)).toThrow(AccessError)
    expect(() => assertOwnUser('other', ACCESS)).toThrow(AccessError)
  })
})
