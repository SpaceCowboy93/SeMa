/**
 * Regression tests — mount-time error classification on LandingPage.
 *
 * The useEffect on mount calls getVerifiedAccess() to redirect already-signed-in
 * users. If it throws, the error must be classified through classifyAuthError
 * before being shown — never raw Supabase messages, internal text or stack traces.
 *
 * Special case: a 401 AccessError means "not signed in" (the normal state for a
 * new visitor). It is silently suppressed — no error banner is shown.
 *
 * Cases tested:
 *   1. 401 AccessError      → no error rendered (silenced)
 *   2. HTTP 402 / quota     → service-unavailable message
 *   3. HTTP 500 / server    → service-unavailable message
 *   4. TypeError / offline  → network message
 *   5. 403 AccessError      → safe app message (pass-through)
 *   6. 503 AccessError      → safe app message (pass-through)
 *   7. Unknown object       → generic message
 *   8. Raw internal Error   → generic message (raw text never rendered)
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import LandingPage from '@/app/page'
import { AccessError } from '@/lib/couple-access'

// ── Mock getVerifiedAccess ────────────────────────────────────────────────────
// The global supabase mock in setup.ts stubs @/lib/supabase.
// We only need to control getVerifiedAccess here.

vi.mock('@/lib/auth', () => ({
  getVerifiedAccess: vi.fn(),
}))

import { getVerifiedAccess } from '@/lib/auth'
const mockGVA = vi.mocked(getVerifiedAccess)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function renderAndFlush() {
  render(<LandingPage />)
  // Flush the useEffect + promise microtasks so the catch block runs.
  await act(async () => {})
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LandingPage mount-time error classification', () => {
  beforeEach(() => {
    mockGVA.mockReset()
  })

  // 1. Normal "not signed in" state — 401 is silenced.
  it('does not render an error banner when the user is not signed in (401)', async () => {
    mockGVA.mockRejectedValue(new AccessError(401, 'Please sign in to SeMa.'))
    await renderAndFlush()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // 2. Quota restriction (HTTP 402) — service-unavailable message.
  it('shows service-unavailable message for HTTP 402 quota restriction', async () => {
    mockGVA.mockRejectedValue({ status: 402, message: 'exceed_egress_quota' })
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "SeMa's database is temporarily unavailable",
    )
  })

  // 3. Server error (HTTP 500) — service-unavailable message.
  it('shows service-unavailable message for HTTP 500', async () => {
    mockGVA.mockRejectedValue({ status: 500, message: 'Internal Server Error' })
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent(
      "SeMa's database is temporarily unavailable",
    )
  })

  // 4. Network failure (TypeError from fetch()) — network message.
  it('shows network message for a TypeError (browser offline)', async () => {
    mockGVA.mockRejectedValue(new TypeError('Failed to fetch'))
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to reach SeMa')
  })

  // 5. 403 AccessError (not linked) — safe app-written message passes through.
  it('shows safe membership-failure message for 403 AccessError', async () => {
    mockGVA.mockRejectedValue(new AccessError(403, 'This account is not linked to SeMa.'))
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This account is not linked to SeMa.',
    )
  })

  // 6. 503 AccessError (profile lookup failed) — safe app-written message passes through.
  it('shows safe access-failure message for 503 AccessError', async () => {
    mockGVA.mockRejectedValue(
      new AccessError(503, 'Account access could not be verified. Please try again.'),
    )
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Account access could not be verified. Please try again.',
    )
  })

  // 7. Completely unknown error — generic message.
  it('shows generic message for an unknown non-Error object', async () => {
    mockGVA.mockRejectedValue({ weird: 'object', nested: { data: true } })
    await renderAndFlush()
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to sign in. Please try again.')
  })

  // 8. Raw internal error — generic message; raw text is never rendered.
  it('never renders raw internal error messages', async () => {
    const rawMessage = 'postgrest error: relation "profiles" does not exist at line 1 column 24'
    mockGVA.mockRejectedValue(new Error(rawMessage))
    await renderAndFlush()
    const alert = screen.getByRole('alert')
    // Generic message shown instead.
    expect(alert).toHaveTextContent('Unable to sign in. Please try again.')
    // Raw internal text must not appear.
    expect(alert).not.toHaveTextContent(rawMessage)
  })
})
