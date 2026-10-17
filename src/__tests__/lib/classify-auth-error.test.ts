/**
 * Regression tests for classifyAuthError.
 *
 * Each case maps a raw error value (Supabase AuthError shape, TypeError,
 * AccessError, or unknown) to the correct user-facing string.
 *
 * No network calls are made. No Supabase client is used.
 */

import { describe, it, expect } from 'vitest'
import { classifyAuthError } from '@/lib/classify-auth-error'
import { AccessError } from '@/lib/couple-access'

// Minimal Supabase AuthError shape used throughout these tests.
function authError(status: number, message: string) {
  return { status, message, __isAuthError: true, name: 'AuthApiError' }
}

// ── Invalid credentials ────────────────────────────────────────────────────

describe('invalid credentials', () => {
  it('returns credential message for status-400 AuthError', () => {
    expect(classifyAuthError(authError(400, 'Invalid login credentials'))).toBe(
      'We could not sign you in. Please check your email and password.',
    )
  })

  it('returns credential message for Error with "Invalid login credentials" text', () => {
    expect(classifyAuthError(new Error('Invalid login credentials'))).toBe(
      'We could not sign you in. Please check your email and password.',
    )
  })

  it('returns credential message for Error with "invalid credentials" (case-insensitive)', () => {
    expect(classifyAuthError(new Error('INVALID CREDENTIALS'))).toBe(
      'We could not sign you in. Please check your email and password.',
    )
  })
})

// ── HTTP 402 / quota / service restriction ─────────────────────────────────

describe('service unavailable — HTTP 402', () => {
  it('returns service message for status-402 AuthError', () => {
    expect(
      classifyAuthError(
        authError(402, 'Service for this project is restricted due to the following violations: exceed_egress_quota.'),
      ),
    ).toBe("SeMa's database is temporarily unavailable. Please try again later.")
  })

  it('returns service message for plain Error with exceed_egress_quota in message', () => {
    expect(classifyAuthError(new Error('exceed_egress_quota violation'))).toBe(
      "SeMa's database is temporarily unavailable. Please try again later.",
    )
  })

  it('returns service message for plain Error with "Service for this project is restricted" text', () => {
    expect(
      classifyAuthError(
        new Error(
          'Service for this project is restricted due to the following violations: exceed_egress_quota. The project owner must upgrade their plan.',
        ),
      ),
    ).toBe("SeMa's database is temporarily unavailable. Please try again later.")
  })

  it('returns service message for Error with "project is restricted" fragment', () => {
    expect(classifyAuthError(new Error('project is restricted: quota'))).toBe(
      "SeMa's database is temporarily unavailable. Please try again later.",
    )
  })
})

// ── Generic 5xx / service failure ─────────────────────────────────────────

describe('service unavailable — 5xx', () => {
  it('returns service message for status-500 AuthError', () => {
    expect(classifyAuthError(authError(500, 'Internal server error'))).toBe(
      "SeMa's database is temporarily unavailable. Please try again later.",
    )
  })

  it('returns service message for status-503 AuthError', () => {
    expect(classifyAuthError(authError(503, 'Service unavailable'))).toBe(
      "SeMa's database is temporarily unavailable. Please try again later.",
    )
  })

  it('returns service message for status-502', () => {
    expect(classifyAuthError(authError(502, 'Bad gateway'))).toBe(
      "SeMa's database is temporarily unavailable. Please try again later.",
    )
  })
})

// ── Network / offline failure ──────────────────────────────────────────────

describe('network failure', () => {
  it('returns network message for a TypeError (fetch threw)', () => {
    expect(classifyAuthError(new TypeError('Failed to fetch'))).toBe(
      'Unable to reach SeMa. Check your internet connection and try again.',
    )
  })

  it('returns network message for Error with "Failed to fetch" message', () => {
    expect(classifyAuthError(new Error('Failed to fetch'))).toBe(
      'Unable to reach SeMa. Check your internet connection and try again.',
    )
  })

  it('returns network message for Error with "fetch failed" (case-insensitive)', () => {
    expect(classifyAuthError(new Error('fetch failed'))).toBe(
      'Unable to reach SeMa. Check your internet connection and try again.',
    )
  })

  it('returns network message for Error with "NetworkError" keyword', () => {
    expect(classifyAuthError(new Error('NetworkError when attempting to fetch resource.'))).toBe(
      'Unable to reach SeMa. Check your internet connection and try again.',
    )
  })

  it('returns network message for Error with "network request failed"', () => {
    expect(classifyAuthError(new Error('Network request failed'))).toBe(
      'Unable to reach SeMa. Check your internet connection and try again.',
    )
  })
})

// ── Profile / membership failure (AccessError pass-through) ───────────────

describe('AccessError pass-through', () => {
  it('passes through 403 AccessError message unchanged (not linked to SeMa)', () => {
    const err = new AccessError(403, 'This account is not linked to SeMa.')
    expect(classifyAuthError(err)).toBe('This account is not linked to SeMa.')
  })

  it('passes through 503 AccessError message unchanged (profile lookup failed)', () => {
    const err = new AccessError(503, 'Account access could not be verified. Please try again.')
    expect(classifyAuthError(err)).toBe(
      'Account access could not be verified. Please try again.',
    )
  })

  it('passes through 403 couple-state AccessError message', () => {
    const err = new AccessError(403, 'This account cannot access this shared space.')
    expect(classifyAuthError(err)).toBe('This account cannot access this shared space.')
  })
})

// ── Unknown / unexpected errors ────────────────────────────────────────────

describe('unknown errors', () => {
  it('returns generic message for a plain Error with unrecognised message', () => {
    expect(classifyAuthError(new Error('Something completely unexpected happened'))).toBe(
      'Unable to sign in. Please try again.',
    )
  })

  it('returns generic message for a thrown string', () => {
    expect(classifyAuthError('some string error')).toBe('Unable to sign in. Please try again.')
  })

  it('returns generic message for null', () => {
    expect(classifyAuthError(null)).toBe('Unable to sign in. Please try again.')
  })

  it('returns generic message for undefined', () => {
    expect(classifyAuthError(undefined)).toBe('Unable to sign in. Please try again.')
  })

  it('returns generic message for an empty plain object', () => {
    expect(classifyAuthError({})).toBe('Unable to sign in. Please try again.')
  })

  it('returns generic message for an object with unknown status (e.g. 404)', () => {
    expect(classifyAuthError(authError(404, 'Not found'))).toBe('Unable to sign in. Please try again.')
  })
})
