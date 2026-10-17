'use client'

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { getWeekStartDate } from '@/lib/utils'

interface ScheduledItem {
  id: string
  title: string
  datetime: Date
}

function parseDateTime(date: string, time: string): Date | null {
  // Avoid appending :00 if startTime already contains seconds (HH:MM:SS)
  const timeStr = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : `${time}:00`
  const dt = new Date(`${date}T${timeStr}`)
  if (isNaN(dt.getTime())) {
    console.warn(`[SeMa] Invalid Date: "${date}T${timeStr}" — skipping`)
    return null
  }
  return dt
}

function prevDayAt8PM(eventDate: Date): Date {
  // Previous calendar day at 20:00 local — NOT simply eventMs - 24h
  const d = new Date(eventDate)
  d.setDate(d.getDate() - 1)
  d.setHours(20, 0, 0, 0)
  return d
}

function collectTimedItems(): ScheduledItem[] {
  const { events, todos, goals, wishlistItems, countdowns } = useAppStore.getState()
  const items: ScheduledItem[] = []

  events.forEach(e => {
    if (e.date && e.startTime) {
      const dt = parseDateTime(e.date, e.startTime)
      if (dt) items.push({ id: e.id, title: e.title, datetime: dt })
    }
  })

  todos.forEach(t => {
    if (!t.isCompleted && t.date && t.startTime) {
      const dt = parseDateTime(t.date, t.startTime)
      if (dt) items.push({ id: t.id, title: t.title, datetime: dt })
    }
  })

  goals.forEach(g => {
    if (!g.isCompleted && g.targetDate && g.startTime) {
      const dt = parseDateTime(g.targetDate, g.startTime)
      if (dt) items.push({ id: g.id, title: g.title, datetime: dt })
    }
  })

  wishlistItems.forEach(w => {
    if (!w.isCompleted && w.date && w.startTime) {
      const dt = parseDateTime(w.date, w.startTime)
      if (dt) items.push({ id: w.id, title: w.title, datetime: dt })
    }
  })

  countdowns.forEach(c => {
    if (c.date) {
      const dt = parseDateTime(c.date, c.time ?? '09:00')
      if (dt) items.push({ id: c.id, title: c.title, datetime: dt })
    }
  })

  return items
}

// ── Focus activities: single explicit fire time ───────────────────────────────

function computeFocusFireAt(
  weekKey: string,
  dayIndex: number,
  time: string,
  reminder: string,
): Date | null {
  const monday = getWeekStartDate(weekKey)
  const actDate = new Date(monday)
  actDate.setDate(actDate.getDate() + dayIndex)
  const [h, m] = time.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  actDate.setHours(h, m, 0, 0)

  const offsets: Record<string, number> = {
    at_time: 0,
    '10min': 10 * 60 * 1000,
    '30min': 30 * 60 * 1000,
    '1h':    60 * 60 * 1000,
  }
  const off = offsets[reminder]
  if (off === undefined) return null
  return new Date(actDate.getTime() - off)
}

function collectFocusTimedItems(): ScheduledItem[] {
  const { focusActivities } = useAppStore.getState()
  const items: ScheduledItem[] = []
  focusActivities.forEach(a => {
    if (a.isCompleted || !a.time) return
    // Support both new `reminders` array and legacy `reminder` single value
    const activeReminders = a.reminders && a.reminders.length > 0
      ? a.reminders
      : a.reminder && a.reminder !== 'none'
      ? [a.reminder]
      : []
    for (const r of activeReminders) {
      const fireAt = computeFocusFireAt(a.weekKey, a.dayIndex, a.time, r)
      if (fireAt) items.push({ id: `${a.id}-${r}`, title: a.title, datetime: fireAt })
    }
  })
  return items
}

// setTimeout silently overflows for delays above 2^31−1 ms (~24.8 days) and fires
// immediately instead of waiting. Cap here; the visibility-change handler reschedules
// items that are still in the future when the page next becomes visible.
const MAX_TIMER_DELAY = 2 ** 31 - 2

function fireNotification(body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    new Notification('SeMa 💕', { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' })
  } catch {
    // Notifications not supported in this context
  }
}

export function useNotifications(enabled = true) {
  const timerIds = useRef<ReturnType<typeof setTimeout>[]>([])

  function clearAll() {
    timerIds.current.forEach(clearTimeout)
    timerIds.current = []
  }

  function scheduleAll() {
    clearAll()
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    const now   = Date.now()
    const items = collectTimedItems()

    console.log(
      `[SeMa] scheduleAll — now: ${new Date(now).toLocaleTimeString()}, items: ${items.length}`,
    )

    // Focus activities: fire at their explicit reminder time (no 3-tier system)
    collectFocusTimedItems().forEach(item => {
      const fireMs = item.datetime.getTime()
      if (fireMs <= now) return
      const delay = fireMs - now
      if (delay > MAX_TIMER_DELAY) return
      console.log(`[SeMa] SCHEDULE focus reminder "${item.title}" in ${Math.round(delay / 60000)}min`)
      const id = setTimeout(() => {
        console.log(`[SeMa] FIRE focus reminder "${item.title}"`)
        fireNotification(`${item.title} 💫`)
      }, delay)
      timerIds.current.push(id)
    })

    items.forEach(item => {
      const eventMs = item.datetime.getTime()

      if (eventMs <= now) {
        console.log(`[SeMa] SKIP past event: "${item.title}" at ${item.datetime.toLocaleString()}`)
        return
      }

      const reminders: { fireAt: number; label: string; message: string }[] = [
        {
          fireAt: prevDayAt8PM(item.datetime).getTime(),
          label: 'prev-day-8PM',
          message: `Tomorrow: ${item.title} 💞`,
        },
        {
          fireAt: eventMs - 60 * 60 * 1000,   // exactly 1 hour before
          label: '1h-before',
          message: `1 hour until your moment — ${item.title} 🌊`,
        },
        {
          fireAt: eventMs - 5 * 60 * 1000,    // exactly 5 minutes before
          label: '5min-before',
          message: `Starting in 5 minutes… ${item.title} 💫`,
        },
      ]

      reminders.forEach(r => {
        const delay = r.fireAt - now
        if (delay <= 0) {
          console.log(
            `[SeMa] SKIP past reminder "${r.label}" for "${item.title}":`,
            `was ${new Date(r.fireAt).toLocaleString()}`,
          )
          return
        }
        if (delay > MAX_TIMER_DELAY) return

        console.log(
          `[SeMa] SCHEDULE "${r.label}" for "${item.title}":`,
          `fire at ${new Date(r.fireAt).toLocaleString()}`,
          `delay ${Math.round(delay / 1000)}s (${Math.round(delay / 60000)}min)`,
        )

        const id = setTimeout(() => {
          console.log(`[SeMa] FIRE "${r.label}" for "${item.title}"`)
          fireNotification(r.message)
        }, delay)
        timerIds.current.push(id)
      })
    })
  }

  useEffect(() => {
    if (!enabled) { clearAll(); return }
    let active = true
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().then(() => { if (active) scheduleAll() })
    } else {
      scheduleAll()
    }

    // Re-schedule immediately whenever any store state changes (add/edit/delete)
    const unsub = useAppStore.subscribe(scheduleAll)

    // Re-schedule when tab comes back to foreground
    function onVisibility() {
      if (document.visibilityState === 'visible') scheduleAll()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      active = false
      clearAll()
      unsub()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])
}
