import { beforeEach, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import { establishAuth, getAuthGeneration, invalidateAuth, getAuthContext } from '@/lib/auth-session'
import { selectSharedState } from '@/lib/shared-state'
import { resolveCoupleAccess } from '@/lib/couple-access'
const access = { userId: 'a', userName: 'mateo' as const, coupleId: 'a', stateId: 'sema' }
beforeEach(() => { invalidateAuth(); vi.restoreAllMocks(); establishAuth(access, getAuthGeneration()); vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'token-a' } }, error: null } as never) })
it('sends a bearer token and rejects unauthorized responses', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }))
  await authenticatedFetch('/api/push/status')
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer token-a')
  expect(getAuthContext()).toBeNull()
})
it('rejects old API results after switching sessions', async () => {
  let resolve!: (response: Response) => void
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(r => { resolve = r }))
  const request = authenticatedFetch('/api/push/status')
  await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
  invalidateAuth(); establishAuth({ ...access, userId: 'b' }, getAuthGeneration())
  resolve(new Response('{}'))
  await expect(request).rejects.toThrow('Session changed')
})
it('rejects external URLs before reading credentials', async () => {
  await expect(authenticatedFetch('https://example.com/api/foo')).rejects.toThrow('same-origin')
})
it('does not hydrate identity or store methods from shared JSON', () => {
  expect(selectSharedState({ currentUser: 'seval', setCurrentUser: 'bad', monthlyIncome: 20 })).toEqual({ monthlyIncome: 20 })
})
it('denies access without membership instead of falling back to legacy state', async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }
  await expect(resolveCoupleAccess(client as never, 'a')).rejects.toMatchObject({ status: 403 })
})
