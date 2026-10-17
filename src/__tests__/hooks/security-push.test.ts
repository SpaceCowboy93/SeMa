import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { usePushNotifications } from '@/hooks/usePushNotifications'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { useAppStore } from '@/store/useAppStore'
vi.mock('@/lib/authenticated-fetch', () => ({ authenticatedFetch: vi.fn() }))
const access = { userId: 'a', userName: 'mateo' as const, coupleId: 'a', stateId: 'sema' }
beforeEach(() => { invalidateAuth(); vi.clearAllMocks(); establishAuth(access, getAuthGeneration()) })
it('does not submit old reminder data under a switched account', async () => {
  let resolve!: (value: null) => void
  const getSubscription = vi.fn(() => new Promise<null>(r => { resolve = r }))
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription } }), register: vi.fn(async () => ({})), addEventListener: vi.fn(), removeEventListener: vi.fn() } })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function () {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })
  const hook = renderHook(() => usePushNotifications())
  let task!: Promise<void>
  await act(async () => { task = hook.result.current.syncReminders('mateo'); await Promise.resolve() })
  act(() => { invalidateAuth(); establishAuth({ ...access, userId: 'b', userName: 'seval' }, getAuthGeneration()) })
  await act(async () => { resolve(null); await task })
  expect(authenticatedFetch).not.toHaveBeenCalled()
  hook.unmount()
})
it('requests authenticated reconnection on worker renewal messages', async () => {
  const listeners: Record<string, (event: MessageEvent) => void> = {}
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { addEventListener: (name: string, fn: (event: MessageEvent) => void) => { listeners[name] = fn }, removeEventListener: vi.fn() } })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })
  const hook = renderHook(() => usePushNotifications())
  act(() => listeners.message({ data: { type: 'PUSH_RECONNECT_REQUIRED' } } as MessageEvent))
  expect(hook.result.current.serverSaved).toBe(false)
  expect(hook.result.current.swError).toContain('reconnect')
  expect(authenticatedFetch).not.toHaveBeenCalled()
  hook.unmount()
})

// ── Additional security regression tests ─────────────────────────────────────

it('syncReminders bails immediately when there is no auth context (signed-out denial)', async () => {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'denied' },
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  })
  const hook = renderHook(() => usePushNotifications())
  // Sign the user out — context becomes null, syncReminders closes over null context
  act(() => { invalidateAuth() })
  await act(async () => { await hook.result.current.syncReminders('mateo') })
  expect(vi.mocked(authenticatedFetch)).not.toHaveBeenCalled()
  hook.unmount()
})

it('disable() makes no API call when auth invalidates while awaiting getSubscription', async () => {
  let resolveGetSub!: (v: null) => void
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: { getSubscription: vi.fn(() => new Promise<null>(r => { resolveGetSub = r })) },
      }),
      register: vi.fn(async () => ({})),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  })
  Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManagerStub() {} })
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })

  const hook = renderHook(() => usePushNotifications())

  let disableTask!: Promise<void>
  await act(async () => {
    disableTask = hook.result.current.disable()
    await Promise.resolve()  // let disable() start but remain suspended at getSubscription
  })
  // Switch accounts while getSubscription is pending
  act(() => { invalidateAuth(); establishAuth({ ...access, userId: 'b', userName: 'seval' }, getAuthGeneration()) })
  await act(async () => { resolveGetSub(null); await disableTask })

  expect(vi.mocked(authenticatedFetch)).not.toHaveBeenCalled()
  hook.unmount()
})

it('syncReminders sends userName "mateo" in the request body (correct recipient)', async () => {
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  })
  vi.mocked(authenticatedFetch).mockResolvedValue({
    ok: true, status: 200, json: async () => ({ synced: 0 }),
  } as unknown as Response)
  useAppStore.setState({ events: [], todos: [], goals: [], wishlistItems: [], countdowns: [], focusActivities: [] } as never)

  const hook = renderHook(() => usePushNotifications())
  await act(async () => { await hook.result.current.syncReminders('mateo') })

  const calls = vi.mocked(authenticatedFetch).mock.calls.filter(([u]) => u === '/api/push/sync-reminders')
  expect(calls.length).toBeGreaterThan(0)
  expect(JSON.parse(calls[0][1]!.body as string).userName).toBe('mateo')
  hook.unmount()
})

it('syncReminders sends userName "seval" when called for the partner (correct recipient)', async () => {
  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  })
  vi.mocked(authenticatedFetch).mockResolvedValue({
    ok: true, status: 200, json: async () => ({ synced: 0 }),
  } as unknown as Response)
  useAppStore.setState({ events: [], todos: [], goals: [], wishlistItems: [], countdowns: [], focusActivities: [] } as never)

  const hook = renderHook(() => usePushNotifications())
  await act(async () => { await hook.result.current.syncReminders('seval') })

  const calls = vi.mocked(authenticatedFetch).mock.calls.filter(([u]) => u === '/api/push/sync-reminders')
  expect(calls.length).toBeGreaterThan(0)
  expect(JSON.parse(calls[0][1]!.body as string).userName).toBe('seval')
  hook.unmount()
})

it('syncReminders produces stable reminder labels on repeated calls (idempotency basis)', async () => {
  // Event 2 hours in the future: 1h_before and 5min_before are both future; prev_day_8pm is past
  // Use local-time date components — the hook parses "YYYY-MM-DDTHH:MM" as local, not UTC
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
  const timeStr = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({
    events: [{ id: 'ev1', title: 'Test Event', date: dateStr, startTime: timeStr } as never],
    todos: [], goals: [], wishlistItems: [], countdowns: [], focusActivities: [],
  } as never)

  Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'denied' } })
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  })
  vi.mocked(authenticatedFetch).mockResolvedValue({
    ok: true, status: 200, json: async () => ({ synced: 0 }),
  } as unknown as Response)

  const hook = renderHook(() => usePushNotifications())
  await act(async () => { await hook.result.current.syncReminders('mateo') })
  await act(async () => { await hook.result.current.syncReminders('mateo') })

  const calls = vi.mocked(authenticatedFetch).mock.calls.filter(([u]) => u === '/api/push/sync-reminders')
  expect(calls).toHaveLength(2)

  type ReminderRow = { label: string }
  type ItemRow     = { reminders: ReminderRow[] }
  const labels = (call: typeof calls[0]) =>
    (JSON.parse(call[1]!.body as string).items as ItemRow[])
      .flatMap(i => i.reminders.map(r => r.label))
      .sort()

  const labels1 = labels(calls[0])
  const labels2 = labels(calls[1])
  // Labels must be identical across both calls (stable reminder_key inputs)
  expect(labels1).toEqual(labels2)
  expect(labels1.length).toBeGreaterThan(0)
  // All labels must come from the approved offset set
  const VALID_LABELS = new Set(['prev_day_8pm', '1h_before', '5min_before'])
  expect(labels1.every(l => VALID_LABELS.has(l))).toBe(true)
  hook.unmount()
})
