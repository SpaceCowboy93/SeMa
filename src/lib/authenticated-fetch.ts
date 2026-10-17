import { supabase } from './supabase'
import { getAuthContext, invalidateAuth, isCurrentAuth, subscribeAuth } from './auth-session'
import { AccessError } from './couple-access'

export async function authenticatedFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/api/') || path.includes('\\')) throw new Error('Only same-origin API paths are allowed')
  const context = getAuthContext()
  if (!context) throw new AccessError(401, 'Please sign in to SeMa.')
  const { data, error } = await supabase.auth.getSession()
  if (!isCurrentAuth(context)) throw new AccessError(401, 'Session changed. Please try again.')
  if (error || !data.session || data.session.user.id !== context.userId) {
    invalidateAuth()
    throw new AccessError(401, 'Please sign in to SeMa.')
  }
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${data.session.access_token}`)
  const abort = new AbortController()
  const unsubscribe = subscribeAuth(() => { if (!isCurrentAuth(context)) abort.abort() })
  let response: Response
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store', redirect: 'error',
      signal: init.signal ? AbortSignal.any([init.signal, abort.signal]) : abort.signal })
    // Consume the body while cancellation is still subscribed.
    const body = await response.arrayBuffer()
    response = new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : body,
      { status: response.status, statusText: response.statusText, headers: response.headers })
  } finally { unsubscribe() }
  if (!isCurrentAuth(context)) throw new AccessError(401, 'Session changed. Please try again.')
  if (response.status === 401 || response.status === 403) invalidateAuth()
  return response
}
