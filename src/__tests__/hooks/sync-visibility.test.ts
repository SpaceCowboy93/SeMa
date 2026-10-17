/**
 * Regression — background-tab polling (hidden-tab egress defect).
 *
 * The setInterval in useSupabaseSync has no document.visibilityState guard.
 * It polls every 5 s even when the tab is in the background, downloading
 * the full couple_state JSON (~20-30 KB). At 4 sessions × 12 polls/min
 * this explains the ~14 GB Supabase egress observed over 8.6 days.
 *
 * Fix: add `if (document.visibilityState === 'hidden') return` inside the
 * setInterval callback. The existing visibilitychange → pull() path already
 * handles catching up when the tab returns to the foreground.
 *
 * Test 1 (fails before fix, passes after): interval does NOT call
 *   supabase.from() while the tab is hidden.
 * Test 2 (passes before and after fix): visibilitychange to 'visible'
 *   triggers a catch-up pull when the tab comes back to foreground.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { vi } from 'vitest'
import { useSupabaseSync } from '@/hooks/useSupabaseSync'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'

// ── constants must match the hook ────────────────────────────────────────────
const POLL_MS = 300_000

// ── module-level mock hoisted so the factory closure can reference it ─────────
const mocks = vi.hoisted(() => ({ read: vi.fn(), on: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select:      () => q,
        eq:          () => q,
        abortSignal: () => q,
        update:      () => q,
        maybeSingle: () => mocks.read(),
      }
      return q
    },
    // mocks.on captures the postgres_changes callback so tests can fire it.
    channel:       () => ({ on: mocks.on }),
    removeChannel: vi.fn(),
  },
}))

// ── fixtures ──────────────────────────────────────────────────────────────────
const access = { userId: 'u1', userName: 'mateo' as const, coupleId: 'c1', stateId: 'sema' }
const remoteRow = { data: { state: {}, updated_at: '2026-01-01T00:00:00.000Z' } }

// ── lifecycle ─────────────────────────────────────────────────────────────────
beforeEach(async () => {
  vi.useFakeTimers()
  localStorage.clear()
  invalidateAuth()
  clearActiveCouple()
  mocks.read.mockReset().mockResolvedValue(remoteRow)
  mocks.on.mockReset().mockReturnValue({ subscribe: vi.fn() })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
  invalidateAuth()
})

async function start() {
  await loadCoupleCache(access)
  const context = establishAuth(access, getAuthGeneration())!
  const hook = renderHook(() => useSupabaseSync(context))
  await act(async () => {})
  return hook
}

// ── Test 1: hidden tab — interval must NOT poll ────────────────────────────────

it('does NOT call supabase.from in the poll interval while the tab is hidden', async () => {
  // Mount with visible tab; initial pull fires and completes.
  const hook = await start()
  const callsAfterInitialPull = mocks.read.mock.calls.length
  expect(callsAfterInitialPull).toBeGreaterThanOrEqual(1) // sanity

  // Hide the tab.
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })

  // Advance three full poll cycles.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS * 3 + 100) })

  // FAILS with current code — interval fires 3 more times while hidden.
  // PASSES after fix  — interval guard skips pull() when hidden.
  expect(mocks.read.mock.calls.length).toBe(callsAfterInitialPull)

  hook.unmount()
})

// ── Test 2: becoming visible triggers a catch-up pull ─────────────────────────

it('triggers a catch-up pull when the tab returns to visible', async () => {
  // Start with tab hidden; initial pull still fires (not guarded).
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  const hook = await start()

  // Advance past one poll interval — no extra polls while hidden (after fix).
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 100) })
  const callsWhileHidden = mocks.read.mock.calls.length

  // Tab becomes visible — the existing visibilitychange handler calls pull().
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

  // A catch-up read should have fired.
  expect(mocks.read.mock.calls.length).toBeGreaterThan(callsWhileHidden)

  hook.unmount()
})

// ── Test 3: fallback poll fires at POLL_MS, not 5 s ───────────────────────────

it('visible tab polls at the POLL_MS interval and not faster', async () => {
  const hook = await start()
  const afterInit = mocks.read.mock.calls.length

  // Just under one interval — no additional poll.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS - 100) })
  expect(mocks.read.mock.calls.length).toBe(afterInit)

  // Cross the threshold — exactly one poll.
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1)

  // One more interval — second poll.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 2)

  hook.unmount()
})

// ── Test 4: return-to-visible fires exactly one pull and resets the timer ─────

it('fires exactly one catch-up pull when becoming visible and resets the timer', async () => {
  const hook = await start()
  const afterInit = mocks.read.mock.calls.length

  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 100) })
  expect(mocks.read.mock.calls.length).toBe(afterInit) // no polls while hidden

  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1) // exactly one catch-up

  // Timer was reset by onVisible — next poll is POLL_MS away, not immediate.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS - 100) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1) // still just one

  hook.unmount()
})

// ── Test 5: online event fires exactly one catch-up pull ──────────────────────

it('fires exactly one catch-up pull when the browser comes online', async () => {
  const hook = await start()
  const afterInit = mocks.read.mock.calls.length

  await act(async () => { window.dispatchEvent(new Event('online')) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1)

  hook.unmount()
})

// ── Test 6: rapid events don't create overlapping in-flight pulls ─────────────

it('rapid online events produce at most one in-flight pull', async () => {
  const hook = await start()
  const afterInit = mocks.read.mock.calls.length

  // Three synchronous online events — only the first should start a pull.
  // The 2nd and 3rd see reading=true and return immediately.
  await act(async () => {
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
  })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1)

  hook.unmount()
})

// ── Test 7: unmount removes visibilitychange and online listeners ──────────────

it('removes visibilitychange and online listeners on unmount', async () => {
  const removeDoc = vi.spyOn(document, 'removeEventListener')
  const removeWin = vi.spyOn(window,   'removeEventListener')

  const hook = await start()
  hook.unmount()
  await act(async () => {})

  expect(removeDoc).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  expect(removeWin).toHaveBeenCalledWith('online', expect.any(Function))

  removeDoc.mockRestore()
  removeWin.mockRestore()
})

// ── Test 8: stale in-flight pull is discarded after unmount ───────────────────

it('does not apply remote state after the hook unmounts', async () => {
  let resolveHangingRead!: (v: unknown) => void
  mocks.read.mockReset()
    .mockResolvedValueOnce(remoteRow)  // initial pull completes normally
    .mockImplementation(() => new Promise(res => { resolveHangingRead = res })) // next hangs

  const hook = await start()
  const stateAfterInit = useAppStore.getState()

  // Advance to trigger the poll — the read hangs.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 100) })

  hook.unmount() // sets active=false, aborts signal

  // Resolve the hanging read with injected data.
  resolveHangingRead({ data: { state: { events: [{ id: 'injected' }] }, updated_at: '2026-12-01T00:00:00Z' } })
  await act(async () => {})

  // The current() guard caught it — store must be unchanged.
  expect(useAppStore.getState()).toEqual(stateAfterInit)
})

// ── Test 9: Realtime update fires pull immediately (no poll wait) ──────────────

it('applies a Realtime partner update without waiting for the fallback poll', async () => {
  const hook = await start()
  // mocks.on.mock.calls[0][2] is the postgres_changes callback registered by the hook.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const realtimeCb = mocks.on.mock.calls[0]?.[2] as ((...args: any[]) => void) | undefined
  expect(realtimeCb).toBeDefined()
  const afterInit = mocks.read.mock.calls.length

  // Simulate a postgres_changes event from a partner write.
  await act(async () => { realtimeCb?.() })

  // A pull was triggered immediately.
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1)

  // The interval was also reset — no additional poll before the next POLL_MS window.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS - 100) })
  expect(mocks.read.mock.calls.length).toBe(afterInit + 1)

  hook.unmount()
})

// ── Test 10: failed pull preserves local state ────────────────────────────────

it('preserves local state when a poll fetch fails', async () => {
  mocks.read.mockReset()
    .mockResolvedValueOnce(remoteRow)                                // initial pull
    .mockResolvedValue({ data: null, error: new Error('network') }) // subsequent fail

  const hook = await start()
  const stateAfterInit = useAppStore.getState()

  // Trigger a poll — it fails.
  await act(async () => { await vi.advanceTimersByTimeAsync(POLL_MS + 100) })

  // Data unchanged despite failure.
  expect(useAppStore.getState()).toEqual(stateAfterInit)

  hook.unmount()
})
