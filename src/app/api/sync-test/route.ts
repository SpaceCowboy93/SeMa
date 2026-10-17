import { NextResponse } from 'next/server'
import { withCoupleAuth } from '@/lib/supabase-server'
// Account resolution verifies the shared-state mapping. No diagnostics or keys.
export const GET = withCoupleAuth(async () => NextResponse.json({ ok: true }))
