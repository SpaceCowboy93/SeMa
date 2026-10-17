import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNotifications } from '@/hooks/useNotifications'
import { useAppStore } from '@/store/useAppStore'

// MAX_TIMER_DELAY mirrors the constant in the hook
const MAX_TIMER_DELAY = 2 ** 31 - 2

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'granted' },
  })
  // Reset store to a clean state
  useAppStore.setState({ events: [], todos: [], goals: [], wishlistItems: [], countdowns: [], focusActivities: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

it('does not set a timer for an event 60 days in the future (all three reminders exceed the cap)', () => {
  // 60 days out: prevDay/1h/5min reminders are all 57–60 days away, all > MAX_TIMER_DELAY
  const farFuture = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
  const dateStr = farFuture.toISOString().split('T')[0]
  const timeStr = `${String(farFuture.getHours()).padStart(2, '0')}:${String(farFuture.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({ events: [{ id: 'far', title: 'Far event', date: dateStr, startTime: timeStr } as never] })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  renderHook(() => useNotifications(true))
  // No event-reminder timer should be registered (delays > MAX_TIMER_DELAY must be skipped)
  const longDelays = spy.mock.calls
    .map(([, delay]) => delay as number)
    .filter(d => typeof d === 'number' && d > MAX_TIMER_DELAY)
  expect(longDelays).toHaveLength(0)
})

it('does set a timer for an event within the cap', async () => {
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours from now
  // Use local-time date components to match how the hook parses "YYYY-MM-DDTHH:MM" (local, no Z)
  const dateStr = `${soon.getFullYear()}-${String(soon.getMonth() + 1).padStart(2, '0')}-${String(soon.getDate()).padStart(2, '0')}`
  const timeStr = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({ events: [{ id: 'soon', title: 'Soon event', date: dateStr, startTime: timeStr } as never] })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  await act(async () => {})
  const realTimerCalls = spy.mock.calls.filter(([, delay]) => typeof delay === 'number' && (delay as number) > 0)
  expect(realTimerCalls.length).toBeGreaterThan(0)
  hook.unmount()
})

// ── Additional edge-case tests ─────────────────────────────────────────────────
//
// "notification timers" are identified by delay > 60 000 ms (1 min).
// React internal timers use very short delays (< 1 s) and are excluded.

function notifTimerDelays(spy: { mock: { calls: ReadonlyArray<unknown[]> } }): number[] {
  return spy.mock.calls
    .map(([, delay]) => delay as number)
    .filter(d => typeof d === 'number' && d > 60_000)
}

it('skips a past event — no notification timers registered', () => {
  // Event that started 3 hours ago; all three reminder offsets are also in the past.
  const past = new Date(Date.now() - 3 * 60 * 60 * 1000)
  const dateStr = past.toISOString().split('T')[0]
  const timeStr = `${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({ events: [{ id: 'past', title: 'Past event', date: dateStr, startTime: timeStr } as never] })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('skips a completed todo even if it has a future date and startTime', () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const dateStr = future.toISOString().split('T')[0]
  const timeStr = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({
    todos: [{ id: 'done', title: 'Done', date: dateStr, startTime: timeStr, isCompleted: true } as never],
  })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('skips an event that has a date but no startTime', () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000)
  const dateStr = future.toISOString().split('T')[0]
  // No startTime field
  useAppStore.setState({
    events: [{ id: 'no-time', title: 'No time', date: dateStr } as never],
  })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('skips a focus activity whose reminder is "none" (legacy single-value format)', () => {
  // A focus activity with the legacy `reminder` field set to 'none' should produce no timers.
  useAppStore.setState({
    focusActivities: [{
      id: 'f1', title: 'Focus task',
      time: '10:00', reminder: 'none', reminders: [],
      weekKey: '2099-W01', dayIndex: 0, isCompleted: false,
      createdBy: 'mateo', createdAt: '', updatedAt: '',
    } as never],
  })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('skips a focus activity with an empty reminders array (new multi-select format)', () => {
  useAppStore.setState({
    focusActivities: [{
      id: 'f2', title: 'Focus task', time: '10:00',
      reminder: undefined, reminders: [],
      weekKey: '2099-W01', dayIndex: 0, isCompleted: false,
      createdBy: 'mateo', createdAt: '', updatedAt: '',
    } as never],
  })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('skips a completed focus activity', () => {
  useAppStore.setState({
    focusActivities: [{
      id: 'f3', title: 'Done focus',
      time: '10:00', reminders: ['at_time'],
      weekKey: '2099-W01', dayIndex: 0, isCompleted: true,
      createdBy: 'mateo', createdAt: '', updatedAt: '',
    } as never],
  })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('does not set any timers when enabled=false', () => {
  const soon = new Date(Date.now() + 60 * 60 * 1000)
  const dateStr = soon.toISOString().split('T')[0]
  const timeStr = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({ events: [{ id: 'e', title: 'Event', date: dateStr, startTime: timeStr } as never] })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(false))
  // enabled=false → clearAll() is called and no timers are scheduled
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})

it('permission denied — no timers set', () => {
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'denied' },
  })
  const soon = new Date(Date.now() + 60 * 60 * 1000)
  const dateStr = soon.toISOString().split('T')[0]
  const timeStr = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`
  useAppStore.setState({ events: [{ id: 'e', title: 'Event', date: dateStr, startTime: timeStr } as never] })
  const spy = vi.spyOn(globalThis, 'setTimeout')
  const hook = renderHook(() => useNotifications(true))
  // scheduleAll() returns early when permission !== 'granted'
  expect(notifTimerDelays(spy)).toHaveLength(0)
  hook.unmount()
})
