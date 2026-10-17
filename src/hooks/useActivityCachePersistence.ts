'use client'

/**
 * useActivityCachePersistence — loads and saves user-scoped activity data.
 *
 * Responsibilities:
 *  - On mount (or when currentUser changes): load activityEntries and
 *    notificationPrefs from user-scoped localStorage into the Zustand store.
 *  - Subscribe to store changes and write-back on every mutation.
 *  - On logout (currentUser → null): clear in-memory state only (localStorage
 *    is cleared by clearUserCache() called from the auth sign-out path).
 *
 * This hook must be mounted once in (app)/layout.tsx and once in
 * dev-preview/_shell.tsx.  Never mount it twice for the same user.
 */

import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/useAppStore'
import {
  loadActivityFeed,
  saveActivityFeed,
  loadNotifPrefs,
  saveNotifPrefs,
} from '@/lib/user-cache'

export function useActivityCachePersistence() {
  const currentUser         = useAppStore(s => s.currentUser)
  const loadedForRef        = useRef<string | null>(null)

  // ── Load on user change ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) {
      // Signed out — reset in-memory state to empty defaults
      loadedForRef.current = null
      useAppStore.setState({
        activityEntries: [],
        notificationPrefs: useAppStore.getState().notificationPrefs,
      })
      return
    }

    // Already loaded for this user in this session
    if (loadedForRef.current === currentUser) return
    loadedForRef.current = currentUser

    const entries = loadActivityFeed(currentUser)
    const prefs   = loadNotifPrefs(currentUser)
    useAppStore.setState({ activityEntries: entries, notificationPrefs: prefs })
  }, [currentUser])

  // ── Write-back on store changes ─────────────────────────────────────────────

  useEffect(() => {
    const unsub = useAppStore.subscribe(state => {
      const user = state.currentUser
      if (!user) return
      saveActivityFeed(user, state.activityEntries)
      saveNotifPrefs(user, state.notificationPrefs)
    })
    return unsub
  }, [])
}
