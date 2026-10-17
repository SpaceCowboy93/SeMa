import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { AccessError, resolveCoupleAccess, type CoupleAccess } from './couple-access'

function getServerSupabaseClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) throw new AccessError(503, 'Authentication is not configured.')
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

/** Verifies a bearer access token against Supabase Auth for API routes. */
export async function requireCoupleMember(request: Request): Promise<CoupleAccess> {
  const authorization = request.headers.get('authorization') ?? ''
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
  if (!token) throw new AccessError(401, 'Unauthorized')

  const supabase = getServerSupabaseClient(token)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) throw new AccessError(401, 'Unauthorized')
  return resolveCoupleAccess(supabase, data.user.id)
}

export function withCoupleAuth(handler: (request: NextRequest, access: CoupleAccess) => Promise<Response>) {
  return async (request: NextRequest) => {
    try {
      const access = await requireCoupleMember(request)
      const response = await handler(request, access)
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch (error) {
      const status = error instanceof AccessError ? error.status : error instanceof SyntaxError ? 400 : 503
      return NextResponse.json({ error: error instanceof AccessError ? error.message : 'Request could not be completed.' }, { status, headers: { 'Cache-Control': 'no-store' } })
    }
  }
}
