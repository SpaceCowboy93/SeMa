import { beforeEach, expect, it, vi } from 'vitest'
import { logout } from '@/lib/logout'
import { establishAuth, getAuthGeneration, invalidateAuth } from '@/lib/auth-session'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  clearActiveCouple: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, signOut: mocks.signOut } },
}))
vi.mock('@/store/useAppStore', () => ({ clearActiveCouple: mocks.clearActiveCouple }))
vi.mock('@/store/useLightboxStore', () => ({ useLightboxStore: { setState: vi.fn() } }))

const access = { userId: 'a', userName: 'mateo' as const, coupleId: 'a', stateId: 'sema' }

beforeEach(() => {
  invalidateAuth()
  vi.clearAllMocks()
  mocks.signOut.mockResolvedValue({ error: null })
  // No real serviceWorker in test — keep cleanup path idle
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: { ...global.navigator },
  })
})

it('calls signOut locally when the session is cleared normally', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } })
  // invalidateAuth is called inside logout(); no pre-existing auth needed
  await logout()
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
})

it('skips signOut when a new session is established before the session fetch resolves', async () => {
  let resolve!: (v: { data: { session: null } }) => void
  mocks.getSession.mockImplementation(() => new Promise(r => { resolve = r }))
  const logoutPromise = logout()
  // Simulate: new user logs in while the async getSession call is pending
  establishAuth({ ...access, userId: 'b', userName: 'seval' }, getAuthGeneration())
  resolve({ data: { session: null } })
  await logoutPromise
  expect(mocks.signOut).not.toHaveBeenCalled()
})

it('throws if signOut returns an error', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } })
  mocks.signOut.mockResolvedValue({ error: { message: 'network error' } })
  await expect(logout()).rejects.toThrow('Could not finish signing out')
})
