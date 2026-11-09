// Real route/auth wrapper with mocked Supabase and Google boundaries. No API scan.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/receipts/scan/route'
import { readReceiptBody } from '@/lib/receipt-gemini-server'
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ ...mocks, auth: { getUser: mocks.getUser } }) }))
const photos = ['data:image/jpeg;base64,eA==']
const payload = { engine: 'gemini', consent: true, photos }
const request = (body: unknown = payload, token = 'valid') => new NextRequest('http://localhost/api/receipts/scan', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
})
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://wwxdinkdjkjiqzynfbdk.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-public-key')
  vi.stubEnv('GEMINI_API_KEY', 'test-key-never-returned')
  vi.stubEnv('GEMINI_FREE_TIER_CONFIRMED', 'true')
  vi.stubEnv('VERCEL_ENV', 'preview')
  // jsdom lacks Node's server-side AbortSignal.any/timeout statics.
  vi.stubGlobal('AbortSignal', { any: (signals: AbortSignal[]) => signals[0], timeout: () => new AbortController().signal })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ pages: [[{ text: 'MILK 2.00', top: 0.2, bottom: 0.3 }]] }) }] } }] })))
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'auth-mateo' } }, error: null })
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null })
  mocks.from.mockReset().mockImplementation((table: string) => {
    const rows: Record<string, unknown> = { profiles: { app_user_name: 'mateo' }, couple_members: { couple_id: 'couple-a' }, couple_state: { id: 'sema' } }
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: rows[table], error: null }) }
    return query
  })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('rejects signed-out and invalid users before cloud calls or rate reservations', async () => {
  expect((await POST(request(payload, ''))).status).toBe(401)
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: {} })
  expect((await POST(request())).status).toBe(401)
  expect(fetch).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})
it('requires existing couple membership', async () => {
  mocks.from.mockImplementation(() => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q })
  expect((await POST(request())).status).toBe(403)
  expect(fetch).not.toHaveBeenCalled()
})
it('fails closed without a key, free-tier confirmation, or in Production', async () => {
  for (const [key, value] of [['GEMINI_API_KEY', ''], ['GEMINI_FREE_TIER_CONFIRMED', 'false'], ['VERCEL_ENV', 'production']]) {
    vi.stubEnv(key, value)
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).toContain('On-device')
    vi.stubEnv(key, key === 'GEMINI_API_KEY' ? 'test-key-never-returned' : key === 'VERCEL_ENV' ? 'preview' : 'true')
  }
  expect(fetch).not.toHaveBeenCalled()
})
it('requires explicit Gemini consent, bounded inline images and at most eight photos', async () => {
  for (const body of [{ ...payload, consent: false }, { ...payload, engine: 'tesseract' }, { ...payload, photos: ['https://example.com/x'] }, { ...payload, photos: Array(9).fill(photos[0]) }, { ...payload, photos: [] }]) expect((await POST(request(body))).status).toBe(400)
  expect(fetch).not.toHaveBeenCalled()
})
it('enforces the actual streamed byte limit even without Content-Length', async () => {
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4_000_001)); controller.close() } })
  const req = { headers: new Headers({ 'Content-Type': 'application/json' }), body } as Request
  await expect(readReceiptBody(req)).rejects.toMatchObject({ status: 413 })
})
it('does not call Google when durable rate limit denies or fails', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null })
  expect((await POST(request())).status).toBe(429)
  mocks.rpc.mockResolvedValue({ data: null, error: {} })
  expect((await POST(request())).status).toBe(503)
  expect(fetch).not.toHaveBeenCalled()
})
it('calls only the requested model once with a private header and no key in response', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(fetch).toHaveBeenCalledTimes(1)
  const [url, init] = vi.mocked(fetch).mock.calls[0]
  expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent')
  expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'test-key-never-returned' })
  const content = JSON.parse(init?.body as string)
  expect(content.contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'eA==' } }])
  expect(await response.text()).not.toContain('test-key-never-returned')
})
it('returns quota exhaustion without retrying or falling back to any paid model', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('secret provider diagnostics', { status: 429 }))
  const response = await POST(request())
  expect(response.status).toBe(429)
  expect(await response.text()).toContain('Your photos are kept')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects truncated and malformed model output', async () => {
  for (const data of [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{bad' }] } }] }]) {
    vi.mocked(fetch).mockResolvedValue(Response.json(data))
    expect((await POST(request())).status).toBe(502)
  }
})
