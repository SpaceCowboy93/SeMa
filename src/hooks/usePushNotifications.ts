'use client'

import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { getAuthContext, isCurrentAuth, subscribeAuth } from '@/lib/auth-session'

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { OTHER_USER } from '@/types'
import type { UserName } from '@/types'
import { getWeekStartDate } from '@/lib/utils'

const LOG = (...args: unknown[]) => console.log('[Push]', ...args)
const ERR = (...args: unknown[]) => console.error('[Push]', ...args)

// ── Push status ───────────────────────────────────────────────────────────────
// default     — permission not yet requested
// granted     — permission granted, but no PushManager subscription yet
// subscribed  — subscription exists in PushManager
// denied      — user blocked notifications
// unsupported — platform has no Service Worker or PushManager at all
export type PushStatus = 'unsupported' | 'denied' | 'default' | 'granted' | 'subscribed'

// ── Reminder entry (v2) ───────────────────────────────────────────────────────
// Each item now carries labelled reminder entries instead of a raw string[].
// The label is used server-side to:
//   (a) build the stable reminder_key: {user}:{type}:{id}:{label}
//   (b) compute the human-readable push message
//
// Standard labels:  prev_day_8pm | 1h_before | 5min_before
// Focus labels:     at_time | 10min | 30min | 1h

export interface ReminderEntry {
  fireAt: string   // ISO-8601 UTC timestamp
  label:  string   // stable offset identifier
}

export interface DatedItem {
  id:        string
  type:      'event' | 'todo' | 'goal' | 'wishlist' | 'countdown' | 'focus'
  title:     string
  reminders: ReminderEntry[]
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw     = atob(base64)
  const buf     = new ArrayBuffer(raw.length)
  const view    = new DataView(buf)
  for (let i = 0; i < raw.length; i++) view.setUint8(i, raw.charCodeAt(i))
  return buf
}

async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    ERR('serviceWorker not in navigator — unsupported browser')
    return null
  }
  try {
    LOG('Registering service worker /sw.js …')
    const reg = await navigator.serviceWorker.register('/sw.js', {
      scope:            '/',
      updateViaCache:   'none',  // always fetch fresh SW on page load
    })
    LOG('SW registered — scope:', reg.scope, 'state:', reg.active?.state ?? 'installing')
    return reg
  } catch (err) {
    ERR('SW registration failed:', err)
    return null
  }
}

async function getCurrentSub(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    LOG('Existing subscription:', sub ? sub.endpoint.slice(-40) : 'none')
    return sub
  } catch (err) {
    ERR('getSubscription failed:', err)
    return null
  }
}

async function fetchServerSaved(userName: string): Promise<boolean> {
  const context = getAuthContext()
  if (!context || context.userName !== userName) return false
  try {
    const subscription = await getCurrentSub()
    if (!subscription || !isCurrentAuth(context)) return false
    const res  = await authenticatedFetch(`/api/push/status?userName=${encodeURIComponent(userName.toLowerCase())}&endpoint=${encodeURIComponent(subscription.endpoint)}`)
    const data = await res.json()
    if (!isCurrentAuth(context)) return false
    LOG('serverSaved check for', userName, ':', data.hasSubscription)
    return data.hasSubscription === true
  } catch {
    return false
  }
}


// ── Reminder computation ──────────────────────────────────────────────────────

/** Compute labelled reminder entries for a standard timed item.
 *  Returns only future entries (past ones are skipped and logged). */
function computeReminders(dateStr: string, timeStr: string): ReminderEntry[] {
  const timeNorm = /^\d{2}:\d{2}:\d{2}$/.test(timeStr) ? timeStr : `${timeStr}:00`
  const eventMs  = new Date(`${dateStr}T${timeNorm}`).getTime()
  const now      = Date.now()

  if (isNaN(eventMs)) {
    ERR('computeReminders — invalid date/time:', dateStr, timeStr)
    return []
  }

  const dayBefore = new Date(`${dateStr}T${timeNorm}`)
  dayBefore.setDate(dayBefore.getDate() - 1)
  dayBefore.setHours(20, 0, 0, 0)

  const candidates = [
    { label: 'prev_day_8pm', ms: dayBefore.getTime() },
    { label: '1h_before',    ms: eventMs - 60 * 60 * 1000 },
    { label: '5min_before',  ms: eventMs -  5 * 60 * 1000 },
  ]

  const future  = candidates.filter(c => c.ms > now)
  const skipped = candidates.filter(c => c.ms <= now)
  if (skipped.length) {
    LOG(`computeReminders(${dateStr} ${timeStr}) — skipped past:`,
      skipped.map(c => c.label).join(', '))
  }

  return future.map(c => ({ fireAt: new Date(c.ms).toISOString(), label: c.label }))
}

// ── Item collection ───────────────────────────────────────────────────────────

const FOCUS_OFFSET_MS: Record<string, number> = {
  at_time: 0,
  '5min':  5  * 60 * 1000,
  '10min': 10 * 60 * 1000,
  '30min': 30 * 60 * 1000,
  '1h':    60 * 60 * 1000,
}

/** Collect all future-dated items from the store for a given user.
 *  The returned DatedItem[] is the single source of truth for the sync payload. */
function collectDatedItems(
  store: ReturnType<typeof useAppStore.getState>,
  _userName: UserName,   // kept for future per-user filtering; currently shared data
): DatedItem[] {
  void _userName
  const items: DatedItem[] = []

  store.events.forEach(e => {
    if (e.date && e.startTime) {
      const reminders = computeReminders(e.date, e.startTime)
      if (reminders.length) items.push({ id: e.id, type: 'event', title: e.title, reminders })
    }
  })

  store.todos.forEach(t => {
    if (!t.isCompleted && t.date && t.startTime) {
      const reminders = computeReminders(t.date, t.startTime)
      if (reminders.length) items.push({ id: t.id, type: 'todo', title: t.title, reminders })
    }
  })

  store.goals.forEach(g => {
    if (!g.isCompleted && g.targetDate && g.startTime) {
      const reminders = computeReminders(g.targetDate, g.startTime)
      if (reminders.length) items.push({ id: g.id, type: 'goal', title: g.title, reminders })
    }
  })

  store.wishlistItems.forEach(w => {
    if (!w.isCompleted && w.date && w.startTime) {
      const reminders = computeReminders(w.date, w.startTime)
      if (reminders.length) items.push({ id: w.id, type: 'wishlist', title: w.title, reminders })
    }
  })

  store.countdowns.forEach(c => {
    if (c.date) {
      const reminders = computeReminders(c.date, c.time ?? '09:00')
      if (reminders.length) items.push({ id: c.id, type: 'countdown', title: c.title, reminders })
    }
  })

  // Focus activities: one push notification per configured reminder offset
  ;(store.focusActivities ?? []).forEach(a => {
    if (a.isCompleted || !a.time) return
    // Support both new `reminders` array and legacy `reminder` single value
    const activeReminders = a.reminders && a.reminders.length > 0
      ? a.reminders
      : a.reminder && a.reminder !== 'none'
      ? [a.reminder]
      : []
    if (activeReminders.length === 0) return

    const monday  = getWeekStartDate(a.weekKey)
    const actDate = new Date(monday)
    actDate.setDate(actDate.getDate() + a.dayIndex)
    const [h, m] = a.time.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    actDate.setHours(h, m, 0, 0)

    const scheduledReminders = activeReminders
      .map(r => {
        const offsetMs = FOCUS_OFFSET_MS[r]
        if (offsetMs === undefined) return null
        const fireAtMs = actDate.getTime() - offsetMs
        if (fireAtMs <= Date.now()) return null
        return { fireAt: new Date(fireAtMs).toISOString(), label: r }
      })
      .filter(Boolean) as { fireAt: string; label: string }[]

    if (scheduledReminders.length === 0) return

    items.push({
      id:        a.id,
      type:      'focus',
      title:     a.title,
      reminders: scheduledReminders,
    })
  })

  return items
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePushNotifications() {
  const context = useSyncExternalStore(subscribeAuth, getAuthContext, () => null)
  const currentUser = context?.userName ?? null

  const [status,      setStatus]      = useState<PushStatus>('default')
  const [swError,     setSwError]     = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [swReady,     setSwReady]     = useState(false)
  const [serverSaved, setServerSaved] = useState<boolean | null>(null)
  const [endpoint,    setEndpoint]    = useState<string | null>(null)
  // initialized: true once the async init effect has fully settled.
  // The card shows a "Checking…" state until this is true.
  const [initialized, setInitialized] = useState(false)

  // Initialise: register SW, detect existing subscription, check server record
  useEffect(() => {
    if (typeof window === 'undefined') return
    let active = true
    const current = () => active && !!context && isCurrentAuth(context)
    setServerSaved(null)
    setEndpoint(null)
    setLoading(false)
    setSwError(null)
    setInitialized(false)
    if (!context) return


    ;(async () => {
      try {
        LOG('Init — userAgent:', navigator.userAgent.slice(0, 80))
        LOG('serviceWorker supported:', 'serviceWorker' in navigator)
        LOG('PushManager supported:',   'PushManager' in window)
        LOG('Notification.permission:',
          typeof Notification !== 'undefined' ? Notification.permission : 'N/A')
        LOG('currentUser:', currentUser)

        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          LOG('Push not supported on this platform')
          setStatus('unsupported')
          return
        }

        if (Notification.permission === 'denied') {
          LOG('Notification permission is denied')
          setStatus('denied')
          return
        }

        const reg = await registerSW()
        if (!current()) return
        if (!reg) {
          ERR('SW registration failed — showing degraded UI')
          setSwError('Service worker failed to register. Try refreshing.')
          setStatus('default')
          return
        }
        setSwReady(true)

        const sub = await getCurrentSub()
        if (!current()) return
        if (sub) {
          LOG('Device is already subscribed — endpoint suffix:', sub.endpoint.slice(-40))
          setStatus('subscribed')
          setEndpoint(sub.endpoint)
          // Verify this device belongs to the current authenticated account.
          if (currentUser) {

            const saved = await fetchServerSaved(currentUser)
            if (!current()) return
            setServerSaved(saved)
            if (!saved) {
              LOG('Server has no subscription for', currentUser,
                '— device may be registered under wrong user or stale endpoint')
            }
          }
          return
        }

        setEndpoint(null)
        setServerSaved(null)
        if (Notification.permission === 'granted') {
          LOG('Permission granted but no subscription — showing "Connect this device"')
          setStatus('granted')
        } else {
          LOG('Permission not yet requested — showing "Enable Notifications"')
          setStatus('default')
        }
      } finally {
        // Always mark initialized so the card can show the correct state
        if (current()) setInitialized(true)
      }
    })()
    return () => { active = false }
  }, [context, currentUser])

  // ── Reminder sync ───────────────────────────────────────────────────────────
  // Sends the full current-state item list to the server so push_reminders rows
  // are kept in sync. The server will upsert on reminder_key and delete orphans.
  //
  // Rate-limit note: the server enforces a 3-second minimum between syncs per
  // user. A 429 response is handled gracefully (logged, not thrown).

  const syncReminders = useCallback(async (userName: UserName) => {
    if (!context || !isCurrentAuth(context)) return
    try {
      const store = useAppStore.getState()
      const items = collectDatedItems(store, userName)

      LOG(`syncReminders — user: ${userName}, items: ${items.length}`)
      items.forEach(item =>
        LOG(`  "${item.title}" (${item.type})`,
          item.reminders.map(r => `${r.label}@${r.fireAt.slice(11, 16)}UTC`).join(' | '))
      )

      // Include this device's endpoint so the server can do an ownership check
      const sub = await getCurrentSub()
      if (!context || !isCurrentAuth(context)) return

      const res  = await authenticatedFetch('/api/push/sync-reminders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          userName,
          items,
          endpoint: sub?.endpoint ?? null,
        }),
      })
      const data = await res.json()
      if (!context || !isCurrentAuth(context)) return

      if (res.status === 429) {
        LOG('syncReminders rate-limited — retryAfter:', data.retryAfter, 's')
        return
      }
      LOG('syncReminders response:', res.status, data)
    } catch (err) {
      ERR('syncReminders failed:', err)
    }
  }, [context])

  // Sync reminders for BOTH users so shared events reach both
  const syncBothUsers = useCallback(async (triggerUser: UserName) => {
    LOG('syncBothUsers — triggered by', triggerUser)
    const other = OTHER_USER[triggerUser]
    await syncReminders(triggerUser)
    if (context && isCurrentAuth(context)) await syncReminders(other)
  }, [context, syncReminders])

  useEffect(() => {
    if (!context) return
    const renew = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECONNECT_REQUIRED' && isCurrentAuth(context)) {
        setServerSaved(false)
        setSwError('Your device subscription changed. Please reconnect notifications.')
      }
    }
    navigator.serviceWorker?.addEventListener('message', renew)
    return () => navigator.serviceWorker?.removeEventListener('message', renew)
  }, [context])

  // Auto-sync reminders once when the device is fully subscribed and confirmed by server.
  // This ensures planner/event reminders are current after every page load.
  useEffect(() => {
    if (status === 'subscribed' && serverSaved === true && currentUser) {
      LOG('Auto-sync reminders for confirmed subscribed device:', currentUser)
      syncBothUsers(currentUser as UserName).catch(() => {})
    }
  }, [status, serverSaved, currentUser, syncBothUsers])

  // ── Enable ──────────────────────────────────────────────────────────────────

  const enable = useCallback(async () => {
    if (!context || !isCurrentAuth(context) || !currentUser) {
      ERR('enable() called but currentUser is null')
      return
    }

    let reg: ServiceWorkerRegistration | null = null
    if (!swReady) {
      LOG('SW not ready — attempting registration before subscribe')
      reg = await registerSW()
      if (!isCurrentAuth(context)) return
      if (!reg) {
        ERR('SW still cannot register — cannot subscribe')
        setSwError('Service worker failed. Try refreshing the page.')
        return
      }
      setSwReady(true)
      setSwError(null)
    }

    setLoading(true)
    try {
      LOG('Requesting notification permission …')
      const perm = await Notification.requestPermission()
      if (!isCurrentAuth(context)) return
      LOG('Permission result:', perm)
      if (perm !== 'granted') {
        setStatus(perm === 'denied' ? 'denied' : 'default')
        return
      }

      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) {
        ERR('NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set in environment')
        setSwError('App misconfiguration: VAPID key missing.')
        return
      }
      LOG('VAPID public key present — length:', vapidKey.length)

      LOG('Waiting for SW ready …')
      const swReg = reg ?? await navigator.serviceWorker.ready
      if (!isCurrentAuth(context)) return
      LOG('SW ready — scope:', swReg.scope)

      LOG('Calling PushManager.subscribe() …')
      const sub = await swReg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      if (!isCurrentAuth(context)) return
      LOG('PushManager.subscribe() succeeded')
      LOG('  endpoint suffix:', sub.endpoint.slice(-40))
      LOG('  p256dh present:',  !!sub.toJSON().keys?.p256dh)
      LOG('  auth present:',    !!sub.toJSON().keys?.auth)

      LOG('Saving subscription for user:', currentUser)
      const res  = await authenticatedFetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: sub.toJSON(), userName: currentUser }),
      })
      const data = await res.json()
      if (!context || !isCurrentAuth(context)) return
      LOG('/api/push/subscribe response:', res.status, data)

      if (res.ok) {
        setStatus('subscribed')
        setEndpoint(sub.endpoint)
        setSwError(null)
        setServerSaved(true)
        // Refresh reminders after authenticated registration.

        await syncBothUsers(currentUser)
      } else if (res.status === 503) {
        ERR('subscribe API 503 — push not configured in this environment')
        setSwError('Notifications are not available in this environment.')
        setServerSaved(false)
      } else {
        ERR('subscribe API returned error:', data)
        setSwError(data.error ?? 'Failed to save subscription.')
        setServerSaved(false)
      }
    } catch (err) {
      ERR('enable() error:', err)
      if (context && isCurrentAuth(context)) setSwError(String(err))
    } finally {
      if (context && isCurrentAuth(context)) setLoading(false)
    }
  }, [context, swReady, currentUser, syncBothUsers])

  // ── Reconnect ───────────────────────────────────────────────────────────────
  // Re-saves the existing PushManager subscription under the active user.
  // Use when the device was registered under the wrong user.

  const reconnect = useCallback(async () => {
    if (!context || !isCurrentAuth(context) || !currentUser) {
      ERR('reconnect() called but currentUser is null')
      return
    }
    setLoading(true)
    try {
      const sub = await getCurrentSub()
      if (!context || !isCurrentAuth(context)) return
      if (!sub) {
        LOG('reconnect() — no PushManager subscription found')
        setSwError('No browser subscription found. Tap "Enable notifications" to set up from scratch.')
        const perm = typeof Notification !== 'undefined' ? Notification.permission : 'default'
        setStatus(perm === 'granted' ? 'granted' : 'default')
        setServerSaved(null)
        setEndpoint(null)
        return
      }

      LOG('reconnect() — re-saving subscription for user:', currentUser)
      LOG('  endpoint suffix:', sub.endpoint.slice(-40))
      const res  = await authenticatedFetch('/api/push/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ subscription: sub.toJSON(), userName: currentUser }),
      })
      const data = await res.json()
      if (!context || !isCurrentAuth(context)) return
      LOG('reconnect /api/push/subscribe response:', res.status, data)

      if (res.ok) {
        setStatus('subscribed')
        setEndpoint(sub.endpoint)
        setSwError(null)
        setServerSaved(true)

        await syncBothUsers(currentUser)
      } else if (res.status === 503) {
        ERR('reconnect API 503 — push not configured in this environment')
        setSwError('Notifications are not available in this environment.')
        setServerSaved(false)
      } else {
        setSwError(data.error ?? 'Failed to save subscription.')
        setServerSaved(false)
      }
    } catch (err) {
      ERR('reconnect() error:', err)
      if (context && isCurrentAuth(context)) setSwError(String(err))
    } finally {
      if (context && isCurrentAuth(context)) setLoading(false)
    }
  }, [context, currentUser, syncBothUsers])

  // ── Disable ─────────────────────────────────────────────────────────────────

  const disable = useCallback(async () => {
    if (!context || !isCurrentAuth(context)) return
    setLoading(true)
    try {
      const sub = await getCurrentSub()
      if (!context || !isCurrentAuth(context)) return
      if (sub) {
        LOG('Removing subscription …')
        const res = await authenticatedFetch('/api/push/subscribe', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        })
        LOG('DELETE /api/push/subscribe:', res.status)
        if (!isCurrentAuth(context)) return
        await sub.unsubscribe()
        LOG('sub.unsubscribe() done')
      } else {
        LOG('disable() — no active subscription found')
      }
      if (!isCurrentAuth(context)) return
      setStatus('default')
      setEndpoint(null)
      setServerSaved(null)
      setSwError(null)
    } catch (err) {
      ERR('disable() error:', err)
    } finally {
      if (context && isCurrentAuth(context)) setLoading(false)
    }
  }, [context])

  return {
    status,
    swError,
    loading,
    serverSaved,
    endpoint,
    initialized,
    enable,
    disable,
    reconnect,
    syncReminders,
  }
}
