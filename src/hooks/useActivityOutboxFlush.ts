'use client'

import { useEffect } from 'react'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { getPendingEntries, loadOutbox, saveOutbox, markDelivered, recordFailure, nextRetryMs } from '@/lib/activity-outbox'
import { getAuthContext, isCurrentAuth, type AuthContext } from '@/lib/auth-session'
import { useSyncStatus } from '@/hooks/useSupabaseSync'
import { pendingKeys, hasCacheStorageError } from '@/lib/durable-cache'

/** Deliver only after the shared snapshot is confirmed on Supabase. */
export function useActivityOutboxFlush(context: AuthContext | null) {
  const { status } = useSyncStatus()
  useEffect(() => {
    if (!context || status !== 'ok') return
    let active = true
    let busy = false
    const flush = async () => {
      if (busy || !active || !isCurrentAuth(context) || getAuthContext() !== context) return
      if (pendingKeys(context).size !== 0 || hasCacheStorageError(context)) return
      busy = true
      try {
        const currentTime = Date.now()
        for (const item of getPendingEntries(context.userName)) {
          if (!active || !isCurrentAuth(context)) break
          if (item.lastAttemptAt &&
            nextRetryMs(item.attempts, Date.parse(item.lastAttemptAt)) > Date.now()) continue
          // Coalesce rapid shopping edits into one message, rather than spamming.
          if (item.event.importance === 'grouped' &&
              currentTime - Date.parse(item.enqueuedAt) < 10000) continue
          try {
            const response = await authenticatedFetch('/api/activity', {
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({...item.event, groupCount:item.groupCount}),
            })
            if (!active || !isCurrentAuth(context)) break
            if (!response.ok) {
              // Missing schema/backend is a rollout issue: retain, never discard.
              if (response.status === 503) break
              throw new Error('Activity delivery failed')
            }
            saveOutbox(context.userName,markDelivered(loadOutbox(context.userName),item.event.id))
          } catch {
            if (!active || !isCurrentAuth(context)) break
            saveOutbox(context.userName,
              recordFailure(loadOutbox(context.userName),item.event.id,'Push delivery failed'))
            break
          }
        }
      } finally { busy = false }
    }
    void flush()
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void flush() }, 5000)
    const onOnline = () => { void flush() }
    window.addEventListener('online',onOnline)
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('online',onOnline) }
  }, [context,status])
}
