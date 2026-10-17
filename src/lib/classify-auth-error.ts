import { AccessError } from './couple-access'

/**
 * Translates a raw sign-in error into a safe, user-facing string.
 *
 * Rules (checked in order):
 *  1. AccessError from getVerifiedAccess  → pass through its message unchanged.
 *  2. Object with numeric .status field   → map by HTTP status code.
 *  3. TypeError (fetch threw, offline)    → network message.
 *  4. Error.message keyword matches       → service or network or credential.
 *  5. Anything else                       → generic message.
 *
 * Never surfaces raw Supabase responses, keys, URLs or stack traces.
 */
export function classifyAuthError(error: unknown): string {
  // 1. Our own domain error — message is already safe and meaningful.
  if (error instanceof AccessError) {
    return error.message
  }

  // 2. Supabase AuthError (and any other duck-typed error with numeric status).
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status: unknown }).status
      : undefined

  if (typeof status === 'number') {
    if (status === 400) {
      return 'We could not sign you in. Please check your email and password.'
    }
    if (status === 402 || status === 503 || status >= 500) {
      return "SeMa's database is temporarily unavailable. Please try again later."
    }
  }

  // 3. Native fetch failure (browser offline, DNS failure, CORS abort).
  if (error instanceof TypeError) {
    return 'Unable to reach SeMa. Check your internet connection and try again.'
  }

  // 4. Message-based fallbacks for cases where status is absent or unexpected.
  if (error instanceof Error) {
    const lower = error.message.toLowerCase()

    if (
      lower.includes('exceed_egress_quota') ||
      lower.includes('project is restricted') ||
      lower.includes('service for this project')
    ) {
      return "SeMa's database is temporarily unavailable. Please try again later."
    }

    if (
      lower.includes('failed to fetch') ||
      lower.includes('fetch failed') ||
      lower.includes('networkerror') ||
      lower.includes('network request failed')
    ) {
      return 'Unable to reach SeMa. Check your internet connection and try again.'
    }

    if (
      lower.includes('invalid login credentials') ||
      lower.includes('invalid credentials')
    ) {
      return 'We could not sign you in. Please check your email and password.'
    }
  }

  // 5. Unknown — generic message that reveals nothing about internals.
  return 'Unable to sign in. Please try again.'
}
