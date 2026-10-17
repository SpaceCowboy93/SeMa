/**
 * Regression tests — dev-preview isolation guarantees.
 *
 * Verifies that the local preview mode:
 *  - Is strictly guarded by NODE_ENV=development
 *  - Never reads or writes real couple-scoped localStorage keys
 *  - Persists only to the isolated preview key
 *  - Renders the "Local Preview" banner
 *  - Uses /dev-preview/* navigation hrefs, never real app routes
 *  - Makes zero Supabase auth calls on mount
 *  - Does not affect the production auth flow on the landing page
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

import {
  isDevPreviewAllowed,
  savePreviewState,
  loadPreviewState,
  clearPreviewState,
  savePreviewUser,
  loadPreviewUser,
  PREVIEW_CACHE_KEY,
  getDevPreviewFixtures,
} from '@/lib/dev-preview-fixtures'
import { supabase } from '@/lib/supabase'
import { DevPreviewShell } from '@/app/dev-preview/_shell'
import LandingPage from '@/app/page'

// Load the component graph during collection, outside the individual render test
// timeout. A timed-out dynamic import can finish during the next test's act(),
// leaking a render and causing cascading cleanup failures on slower machines.
vi.mock('@/lib/auth', () => ({ getVerifiedAccess: vi.fn().mockRejectedValue({ status: 401 }) }))

// ── Helpers ───────────────────────────────────────────────────────────────────

// A realistic couple-scoped key that the real app would write.
const REAL_COUPLE_KEY = 'semacalendar-v2:couple-abc:state-xyz'

beforeEach(() => {
  localStorage.clear()
})

// ── Guard ─────────────────────────────────────────────────────────────────────

describe('isDevPreviewAllowed guard', () => {
  it('returns false in the test environment (NODE_ENV=test)', () => {
    // Vitest sets NODE_ENV to 'test' — preview must not be accessible.
    expect(isDevPreviewAllowed()).toBe(false)
  })

  it('returns true when NODE_ENV is stubbed to development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(isDevPreviewAllowed()).toBe(true)
    vi.unstubAllEnvs()
  })
})

// ── Cache isolation ───────────────────────────────────────────────────────────

describe('cache isolation', () => {
  it('savePreviewState writes only to PREVIEW_CACHE_KEY, not real couple keys', () => {
    // Pre-seed a real couple key so we can verify it is untouched.
    localStorage.setItem(REAL_COUPLE_KEY, '{"events":[]}')

    const fixtures = getDevPreviewFixtures('mateo')
    savePreviewState(fixtures)

    // Preview key must be written.
    expect(localStorage.getItem(PREVIEW_CACHE_KEY)).not.toBeNull()

    // Real key must be intact and unchanged.
    expect(localStorage.getItem(REAL_COUPLE_KEY)).toBe('{"events":[]}')
  })

  it('loadPreviewState returns null when PREVIEW_CACHE_KEY is absent', () => {
    // Real key present but preview key absent — must return null.
    localStorage.setItem(REAL_COUPLE_KEY, '{"events":[]}')
    expect(loadPreviewState()).toBeNull()
  })

  it('save → load roundtrip preserves shared-state fields', () => {
    const fixtures = getDevPreviewFixtures('mateo')
    savePreviewState(fixtures)
    const loaded = loadPreviewState()

    expect(loaded).not.toBeNull()
    expect(loaded!.events).toEqual(fixtures.events)
    expect(loaded!.todos).toEqual(fixtures.todos)
    expect(loaded!.monthlyIncome).toBe(3500)
    expect(loaded!.focusCarryOver).toBe(false)
    expect(loaded!.boomBoomCount).toBe(42)
  })

  it('clearPreviewState removes PREVIEW_CACHE_KEY and leaves real couple keys intact', () => {
    localStorage.setItem(REAL_COUPLE_KEY, '{"events":[]}')
    savePreviewState(getDevPreviewFixtures('mateo'))
    expect(localStorage.getItem(PREVIEW_CACHE_KEY)).not.toBeNull()

    clearPreviewState()

    expect(localStorage.getItem(PREVIEW_CACHE_KEY)).toBeNull()
    // Real key must still exist.
    expect(localStorage.getItem(REAL_COUPLE_KEY)).toBe('{"events":[]}')
  })

  it('loadPreviewState returns null after clearPreviewState', () => {
    savePreviewState(getDevPreviewFixtures('mateo'))
    clearPreviewState()
    expect(loadPreviewState()).toBeNull()
  })
})

// ── User key ──────────────────────────────────────────────────────────────────

describe('user key persistence', () => {
  it('savePreviewUser / loadPreviewUser roundtrip for mateo', () => {
    savePreviewUser('mateo')
    expect(loadPreviewUser()).toBe('mateo')
  })

  it('savePreviewUser / loadPreviewUser roundtrip for seval', () => {
    savePreviewUser('seval')
    expect(loadPreviewUser()).toBe('seval')
  })
})

// ── DevPreviewShell component ─────────────────────────────────────────────────

describe('DevPreviewShell', () => {
  async function renderShell() {
    await act(async () => {
      render(
        <DevPreviewShell>
          <div data-testid="page-content">content</div>
        </DevPreviewShell>,
      )
    })
  }

  it('renders the "Local Preview" banner with role=status', async () => {
    await renderShell()
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent('Local Preview')
    expect(banner).toHaveTextContent('fake data, not synchronized')
  })

  it('renders page children inside the shell', async () => {
    await renderShell()
    expect(screen.getByTestId('page-content')).toBeInTheDocument()
  })

  it('preview nav links all use /dev-preview/* hrefs, never bare real-app routes', async () => {
    await renderShell()
    const nav = screen.getByRole('navigation', { name: /preview navigation/i })
    const links = nav.querySelectorAll('a[href]')

    expect(links.length).toBeGreaterThanOrEqual(5)
    links.forEach(link => {
      const href = link.getAttribute('href') ?? ''
      expect(href).toMatch(/^\/dev-preview\//)
    })
  })

  it('supabase.auth.getSession is never called when shell mounts', async () => {
    vi.mocked(supabase.auth.getSession).mockClear()
    await renderShell()
    expect(supabase.auth.getSession).not.toHaveBeenCalled()
  })
})

// ── Production auth unchanged ─────────────────────────────────────────────────

describe('production auth unchanged', () => {
  it('real landing page still shows email + password sign-in form', async () => {
    await act(async () => {
      render(<LandingPage />)
    })

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /enter sema/i })).toBeInTheDocument()
  })
})
