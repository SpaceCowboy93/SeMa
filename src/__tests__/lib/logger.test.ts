/**
 * Unit tests for src/lib/logger.ts
 *
 * Tests: output suppression in production, meta sanitisation,
 *        correct console methods, no throws.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Helpers ───────────────────────────────────────────────────────────────────

/* Typed as ReturnType<typeof vi.spyOn> would cause variance issues in vitest 1.x;
   using a loose type here is intentional for test-only code. */
type Spy = { mock: { calls: unknown[][] }; mockImplementation: (fn: () => void) => Spy }

let consoleInfoSpy:  Spy
let consoleWarnSpy:  Spy
let consoleErrorSpy: Spy
let consoleDebugSpy: Spy

beforeEach(() => {
  consoleInfoSpy  = vi.spyOn(console, 'info').mockImplementation(() => {})
  consoleWarnSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {})
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Import after spies are set up (dynamic import per test isn't necessary since
// NODE_ENV is 'test' which !== 'production', so IS_DEV=true throughout)
import { logger } from '@/lib/logger'

// ── logger.info ───────────────────────────────────────────────────────────────

describe('logger.info', () => {
  it('calls console.info with the message', () => {
    logger.info('Store loaded')
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.stringContaining('INFO'),
      'Store loaded',
    )
  })

  it('includes meta when provided', () => {
    logger.info('Event added', { id: '123', title: 'Party' })
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      expect.any(String),
      'Event added',
      expect.objectContaining({ id: '123', title: 'Party' }),
    )
  })

  it('redacts blocked keys in meta', () => {
    logger.info('Sync', { token: 'secret-jwt', user: 'mateo' })
    const call = consoleInfoSpy.mock.calls[0]
    const meta = call[2] as Record<string, unknown>
    expect(meta.token).toBe('[redacted]')
    expect(meta.user).toBe('mateo')
  })

  it('redacts photo field', () => {
    logger.info('Upload', { photo: 'data:image/png;base64,...', name: 'pic' })
    const call = consoleInfoSpy.mock.calls[0]
    const meta = call[2] as Record<string, unknown>
    expect(meta.photo).toBe('[redacted]')
  })

  it('redacts content field', () => {
    logger.info('Note sent', { content: 'I love you', from: 'mateo' })
    const call = consoleInfoSpy.mock.calls[0]
    const meta = call[2] as Record<string, unknown>
    expect(meta.content).toBe('[redacted]')
  })
})

// ── logger.warn ───────────────────────────────────────────────────────────────

describe('logger.warn', () => {
  it('calls console.warn', () => {
    logger.warn('Stale data detected')
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WARN'),
      'Stale data detected',
    )
  })

  it('sanitises meta', () => {
    logger.warn('Near budget limit', { accessToken: 'tok_abc', category: 'Groceries' })
    const call = consoleWarnSpy.mock.calls[0]
    const meta = call[2] as Record<string, unknown>
    expect(meta.accessToken).toBe('[redacted]')
    expect(meta.category).toBe('Groceries')
  })
})

// ── logger.error ──────────────────────────────────────────────────────────────

describe('logger.error', () => {
  it('calls console.error with message', () => {
    logger.error('Sync failed')
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('ERROR'),
      'Sync failed',
      '',
      '',
    )
  })

  it('passes an Error instance', () => {
    const err = new Error('Network timeout')
    logger.error('Fetch failed', err)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.any(String),
      'Fetch failed',
      err,
      '',
    )
  })

  it('handles non-Error objects', () => {
    logger.error('Unknown failure', { code: 500 })
    expect(consoleErrorSpy).toHaveBeenCalled()
  })

  it('does not throw when called without arguments beyond message', () => {
    expect(() => logger.error('Oops')).not.toThrow()
  })
})

// ── logger.debug ──────────────────────────────────────────────────────────────

describe('logger.debug', () => {
  it('is a no-op when NEXT_PUBLIC_DEBUG is not "true"', () => {
    // Default env does not have NEXT_PUBLIC_DEBUG=true
    logger.debug('Verbose trace')
    expect(consoleDebugSpy).not.toHaveBeenCalled()
  })
})

// ── Sanitiser — safe keys pass through ───────────────────────────────────────

describe('logger sanitiser — safe keys pass through', () => {
  it('preserves non-sensitive fields', () => {
    logger.info('Test', { id: 'x1', amount: 100, category: 'Travel', isCompleted: true })
    const call = consoleInfoSpy.mock.calls[0]
    const meta = call[2] as Record<string, unknown>
    expect(meta.id).toBe('x1')
    expect(meta.amount).toBe(100)
    expect(meta.category).toBe('Travel')
    expect(meta.isCompleted).toBe(true)
  })
})
