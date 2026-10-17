'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { isCurrentAuth, type AuthContext } from '@/lib/auth-session'
import { useAppStore } from '@/store/useAppStore'
import { toast } from '@/store/useToastStore'
import { DEFAULT_NOTIFICATION_PREFERENCES, mergePreferences } from '@/lib/notification-preferences'
import type { ActivityEntry } from '@/lib/activity-event'

const path = '/api/activity'
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/** Activity inbox: realtime inserts with foreground/online polling fallback. */
export function useActivityFeed(context: AuthContext | null) {
  useEffect(() => {
    if (!context) return
    let active = true
    let initial = true
    let busy = false
    const seen = new Set<string>()
    const current = () => active && isCurrentAuth(context)
    const fetchFeed = async () => {
      if (!current() || busy) return
      busy = true
      try {
        const response = await authenticatedFetch(path)
        if (!response.ok || !current()) return
        const payload = await response.json()
        if (!current() || !Array.isArray(payload.entries)) return
        const prefs = useAppStore.getState().notificationPrefs
        const entries = (payload.entries as ActivityEntry[]).filter(entry =>
          prefs.globalEnabled && (prefs.categories[entry.entityType]?.feedEnabled ?? true))
        const nextIds = new Set(entries.map(e => e.id))
        const fresh = entries.filter(e => !seen.has(e.id) && Date.now() - Date.parse(e.createdAt) < 60000)
        if (!initial && fresh.length) toast.info(fresh.length === 1 ?
          fresh[0].safeBody : `${fresh.length} new updates from your partner`)
        initial = false
        seen.clear()
        nextIds.forEach(id => seen.add(id))
        const local = useAppStore.getState().activityEntries
        const read = new Set(local.filter(e => e.isRead).map(e => e.id))
        useAppStore.setState({activityEntries: entries.map(e => read.has(e.id) ? {...e,isRead:true} : e)})
      } catch { /* Keep last known feed while offline. */ }
      finally { busy = false }
    }

    let prefsReady = false
    const savePrefs = async () => {
      if (!current() || !prefsReady) return
      try {
        await authenticatedFetch(path+'/preferences', {
          method:'PUT',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({prefs:useAppStore.getState().notificationPrefs,timeZone:timeZone()})
        })
      } catch { /* The local preference stays saved for later retry. */ }
    }
    let delay: ReturnType<typeof setTimeout> | undefined
    const onPrefs = useAppStore.subscribe((next,prev) => {
      if (!current() || next.notificationPrefs === prev.notificationPrefs || !prefsReady) return
      clearTimeout(delay)
      delay = setTimeout(() => { void savePrefs() },800)
      void fetchFeed()
    })

    ;(async () => {
      try {
        const response = await authenticatedFetch(path+'/preferences')
        if (!current()) return
        if (response.ok) {
          const data = await response.json()
          if (!current()) return
          if (data.prefs && typeof data.prefs === 'object') {
            const {timeZone:_ignored,...updates} = data.prefs
            void _ignored
            useAppStore.setState({ notificationPrefs:
              mergePreferences(DEFAULT_NOTIFICATION_PREFERENCES,updates) })
          } else {
            // First login saves the user-scoped local/default setting.
            prefsReady = true
            await savePrefs()
          }
        }
      } catch { /* Missing connectivity: never overwrite saved settings. */ }
      finally { prefsReady = true }
    })()
    void fetchFeed()

    const channel = supabase.channel('activity-inbox-'+context.userId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'activity_events',
        filter:'recipient_id=eq.'+context.userId},()=>{ void fetchFeed() })
      .subscribe()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') { void fetchFeed(); void savePrefs() }
    }, 20000)
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchFeed() }
    const onOnline = () => { void fetchFeed(); void savePrefs() }
    document.addEventListener('visibilitychange',onVisible)
    window.addEventListener('online',onOnline)
    return () => {
      active = false
      onPrefs()
      clearTimeout(delay)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange',onVisible)
      window.removeEventListener('online',onOnline)
      void supabase.removeChannel(channel)
    }
  },[context])
}
