/**
 * SeMa logger — safe, typed, development-only diagnostic logging.
 *
 * Rules:
 *   - Only logs in development (NODE_ENV !== 'production').
 *   - Never log passwords, auth tokens, private notes, photo data,
 *     or any personal content.
 *   - Uses standard console methods — no third-party monitoring services.
 *   - All log calls are no-ops in production; no performance cost.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *
 *   logger.info('Store rehydrated', { user: currentUser })
 *   logger.warn('Countdown date in the past', { id, date })
 *   logger.error('Failed to sync', error)
 */

const IS_DEV = process.env.NODE_ENV !== 'production'

/** Safe sanitiser — strips fields that should never appear in logs. */
function sanitise(meta: Record<string, unknown>): Record<string, unknown> {
  const BLOCKED_KEYS = new Set([
    'password', 'token', 'accessToken', 'refreshToken',
    'secret', 'content', 'note', 'photo', 'photos', 'coverPhoto',
    'image', 'backgroundPhoto', 'base64',
  ])
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta)) {
    if (BLOCKED_KEYS.has(k)) {
      result[k] = '[redacted]'
    } else {
      result[k] = v
    }
  }
  return result
}

function prefix(level: string): string {
  return `[SeMa:${level}]`
}

export const logger = {
  /**
   * General informational message.
   * Use for lifecycle events, successful operations.
   */
  info(message: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return
    if (meta) {
      console.info(prefix('INFO'), message, sanitise(meta))
    } else {
      console.info(prefix('INFO'), message)
    }
  },

  /**
   * Non-fatal warning — something unexpected but recoverable.
   * Use for deprecated data shapes, stale cache, near-limit conditions.
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return
    if (meta) {
      console.warn(prefix('WARN'), message, sanitise(meta))
    } else {
      console.warn(prefix('WARN'), message)
    }
  },

  /**
   * Error — something failed.
   * Pass the actual Error object as the second argument when available.
   */
  error(message: string, error?: unknown, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return
    if (error instanceof Error) {
      console.error(prefix('ERROR'), message, error, meta ? sanitise(meta) : '')
    } else {
      console.error(prefix('ERROR'), message, error ?? '', meta ? sanitise(meta) : '')
    }
  },

  /**
   * Debug — verbose tracing, kept out of info to avoid noise.
   * Only active when NEXT_PUBLIC_DEBUG=true.
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return
    if (process.env.NEXT_PUBLIC_DEBUG !== 'true') return
    if (meta) {
      console.debug(prefix('DEBUG'), message, sanitise(meta))
    } else {
      console.debug(prefix('DEBUG'), message)
    }
  },
}
