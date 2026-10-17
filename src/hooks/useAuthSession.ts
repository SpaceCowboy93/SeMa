'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabase'
import { getVerifiedAccess } from '@/lib/auth'
import { establishAuth, getAuthContext, getAuthGeneration, invalidateAuth, subscribeAuth } from '@/lib/auth-session'
import { clearActiveCouple, loadCoupleCache, useAppStore } from '@/store/useAppStore'
import { AccessError } from '@/lib/couple-access'

export function useAuthSession() {
  const context = useSyncExternalStore(subscribeAuth, getAuthContext, () => null)
  const [error, setError] = useState<string | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  useEffect(() => {
    let active = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const removeListener = subscribeAuth(() => {
      if (!getAuthContext()) { clearActiveCouple(); setSignedOut(true) }
    })
    async function validate() {
      const request = ++attempt
      invalidateAuth()
      setSignedOut(false)
      setError(null)
      const generation = getAuthGeneration()
      try {
        const access = await getVerifiedAccess()
        if (!active || request !== attempt || generation !== getAuthGeneration()) return
        await loadCoupleCache(access)
        if (!active || request !== attempt || generation !== getAuthGeneration()) return
        useAppStore.getState().setCurrentUser(access.userName)
        establishAuth(access, generation)
      } catch (failure) {
        if (!active || request !== attempt || generation !== getAuthGeneration()) return
        clearActiveCouple()
        if (failure instanceof AccessError && failure.status === 401) setSignedOut(true)
        else setError(failure instanceof Error ? failure.message : 'Unable to verify account access.')
      }
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        clearTimeout(timer)
        attempt++
        invalidateAuth()
        return
      }
      if (event === 'TOKEN_REFRESHED' && getAuthContext()?.userId === session.user.id) return
      if (event === 'SIGNED_IN' && getAuthContext()?.userId === session.user.id) return
      // Invalidate synchronously, but never call Supabase inside its auth lock.
      attempt++
      invalidateAuth()
      setSignedOut(false)
      clearTimeout(timer)
      timer = setTimeout(() => { void validate() }, 0)
    })
    void validate()
    return () => {
      active = false
      attempt++
      clearTimeout(timer)
      data.subscription.unsubscribe()
      removeListener()
      invalidateAuth()
      clearActiveCouple()
    }
  }, [])
  return { context, error, signedOut }
}
