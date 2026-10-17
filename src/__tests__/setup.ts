import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Keep the existing localStorage journal fault-injection suites exercising that
// legacy adapter through the async interface. IndexedDB integration suites
// explicitly unmock this boundary and use a fresh transactional IDBFactory.
vi.mock('@/lib/durable-cache', async () => {
  const legacy = await import('@/lib/couple-cache')
  return { ...legacy, initializeDurableCache: async () => {}, enableCacheWrites: () => {},
    persistSyncCheckpoint: async (...args: Parameters<typeof legacy.persistSyncCheckpoint>) => legacy.persistSyncCheckpoint(...args) }
})

// Clean up after each test to prevent DOM leaks
afterEach(() => {
  cleanup()
})

// Mock Next.js router — components that import next/navigation will get this stub
vi.mock('next/navigation', () => ({
  useRouter:   () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useParams:   () => ({}),
  useSearchParams: () => ({ get: vi.fn() }),
}))

vi.mock('next/link', () => ({
  // Plain anchor element for tests — Framer Motion and Next.js routing not needed
  /* eslint-disable-next-line */
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
    const React = require('react') /* eslint-disable-line */
    return React.createElement('a', { href, ...rest }, children)
  },
}))

// Stub Supabase — tests must never reach the production database
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:    () => ({ select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn() }),
    auth:    { getSession: vi.fn(), signOut: vi.fn() },
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn(() => ({ data: { publicUrl: '' } })) }) },
    channel: () => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) }),
    removeChannel: vi.fn(),
  },
}))

// Match media stub — jsdom does not implement matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value:    vi.fn().mockImplementation((query: string) => ({
    matches:             false,
    media:               query,
    onchange:            null,
    addListener:         vi.fn(),
    removeListener:      vi.fn(),
    addEventListener:    vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent:       vi.fn(),
  })),
})

// ResizeObserver stub
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe:   vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// IntersectionObserver stub
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe:    vi.fn(),
  unobserve:  vi.fn(),
  disconnect: vi.fn(),
}))
