import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useAuthSession } from '@/hooks/useAuthSession'
import { clearActiveCouple, useAppStore } from '@/store/useAppStore'
import { getAuthContext, invalidateAuth } from '@/lib/auth-session'
import { AccessError } from '@/lib/couple-access'

const mocks = vi.hoisted(() => ({ verify: vi.fn(), callback: null as null | ((event: string, session: unknown) => void) }))
vi.mock('@/lib/auth', () => ({ getVerifiedAccess: mocks.verify }))
vi.mock('@/lib/supabase', () => ({ supabase: { auth: {
  onAuthStateChange: (callback: typeof mocks.callback) => {
    mocks.callback = callback
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  },
} } }))

const access = { userId: 'mateo-auth', userName: 'mateo' as const, coupleId: 'couple-a', stateId: 'sema' }
beforeEach(() => {
  localStorage.clear()
  invalidateAuth()
  clearActiveCouple()
  mocks.verify.mockReset().mockResolvedValue(access)
})

it('restores a verified session and uses profile identity instead of cached identity', async () => {
  localStorage.setItem('semacalendar-v1', JSON.stringify({ state: { currentUser: 'seval' }, version: 0 }))
  const hook = renderHook(() => useAuthSession())
  await waitFor(() => expect(hook.result.current.context?.userName).toBe('mateo'))
  expect(useAppStore.getState().currentUser).toBe('mateo')
  expect(hook.result.current.signedOut).toBe(false)
})

it('clears identity and household data when the session expires', async () => {
  const hook = renderHook(() => useAuthSession())
  await waitFor(() => expect(hook.result.current.context).not.toBeNull())
  act(() => useAppStore.setState({ monthlyIncome: 987 }))
  act(() => mocks.callback?.('SIGNED_OUT', null))
  expect(hook.result.current.signedOut).toBe(true)
  expect(getAuthContext()).toBeNull()
  expect(useAppStore.getState().currentUser).toBeNull()
  expect(useAppStore.getState().monthlyIncome).not.toBe(987)
})

it('cannot restore an old verification result after sign-out', async () => {
  let resolve!: (value: typeof access) => void
  mocks.verify.mockImplementation(() => new Promise(r => { resolve = r }))
  const hook = renderHook(() => useAuthSession())
  act(() => mocks.callback?.('SIGNED_OUT', null))
  await act(async () => resolve(access))
  expect(hook.result.current.context).toBeNull()
  expect(useAppStore.getState().currentUser).toBeNull()
})

it('keeps unlinked accounts out of the protected layout', async () => {
  mocks.verify.mockRejectedValue(new AccessError(403, 'This account is not linked to SeMa.'))
  const hook = renderHook(() => useAuthSession())
  await waitFor(() => expect(hook.result.current.error).toBe('This account is not linked to SeMa.'))
  expect(hook.result.current.context).toBeNull()
  expect(useAppStore.getState().currentUser).toBeNull()
})
