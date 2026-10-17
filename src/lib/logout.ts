import { supabase } from './supabase'
import { getAuthContext, invalidateAuth } from './auth-session'
import { clearActiveCouple } from '@/store/useAppStore'
import { useLightboxStore } from '@/store/useLightboxStore'

export async function logout() {
  const session = supabase.auth.getSession()
  invalidateAuth()
  clearActiveCouple()
  useLightboxStore.setState({ isOpen: false, images: [], index: 0 })
  const { data } = await session
  // Revoke the captured local session before slow device cleanup. Guard against
  // a new login that completed in the brief window between invalidateAuth() and
  // this await: if a new session is already established, do not call signOut()
  // — doing so would clear the new user's stored token, not the old one.
  if (!getAuthContext()) {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw new Error('Could not finish signing out. Please try again.')
  }
  let deviceError = false
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      if (getAuthContext()) return
      registration?.active?.postMessage({ type: 'CLEAR_USER' })
      const subscription = await registration?.pushManager.getSubscription()
      if (getAuthContext()) return
      if (subscription) {
        try {
          if (data.session) {
            const response = await fetch('/api/push/subscribe', {
              method: 'DELETE', cache: 'no-store', redirect: 'error',
              signal: AbortSignal.timeout(5000),
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
              body: JSON.stringify({ endpoint: subscription.endpoint }),
            })
            if (!response.ok) deviceError = true
          }
        } finally { if (!getAuthContext()) await subscription.unsubscribe() }
      }
      for (const notification of await registration?.getNotifications() ?? []) notification.close()
    }
  } catch { deviceError = true }
  if (deviceError) console.warn('Signed out. Device notification cleanup may need a retry when online.')
}
