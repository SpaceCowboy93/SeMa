import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withCoupleAuth } from '@/lib/supabase-server'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => mocks }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://wwxdinkdjkjiqzynfbdk.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-key')
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'auth-mateo' } }, error: null })
  Object.assign(mocks, { auth: { getUser: mocks.getUser } })
  mocks.from.mockReset().mockImplementation((table: string) => {
    const rows: Record<string, unknown> = {
      profiles: { app_user_name: 'mateo' }, couple_members: { couple_id: 'couple-a' }, couple_state: { id: 'sema' },
    }
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: rows[table], error: null }) }
    return query
  })
})

const request = (token?: string) => new NextRequest('http://localhost/api/sync-test', {
  headers: token ? { Authorization: `Bearer ${token}` } : {},
})

it('rejects missing credentials before executing the handler', async () => {
  const handler = vi.fn()
  const response = await withCoupleAuth(handler)(request())
  expect(response.status).toBe(401)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(handler).not.toHaveBeenCalled()
  expect(mocks.getUser).not.toHaveBeenCalled()
})

it('rejects an invalid token before querying membership or executing the handler', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } })
  const handler = vi.fn()
  expect((await withCoupleAuth(handler)(request('invalid'))).status).toBe(401)
  expect(mocks.from).not.toHaveBeenCalled()
  expect(handler).not.toHaveBeenCalled()
})

it('passes verified profile identity and bound legacy state to the handler', async () => {
  const handler = vi.fn(async () => NextResponse.json({ ok: true }))
  const response = await withCoupleAuth(handler)(request('valid'))
  expect(response.status).toBe(200)
  expect(mocks.getUser).toHaveBeenCalledWith('valid')
  expect(handler).toHaveBeenCalledWith(expect.anything(), {
    userId: 'auth-mateo', userName: 'mateo', coupleId: 'couple-a', stateId: 'sema',
  })
})

it('fails closed when the shared-state binding migration is absent', async () => {
  const original = mocks.from.getMockImplementation()!
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'couple_state') return original(table)
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({
      data: null, error: { code: '42703', message: 'column couple_id does not exist' },
    }) }
    return query
  })
  const handler = vi.fn()
  const response = await withCoupleAuth(handler)(request('valid'))
  expect(response.status).toBe(503)
  expect(handler).not.toHaveBeenCalled()
  expect(await response.json()).toEqual({ error: 'Shared access is not configured yet.' })
})
