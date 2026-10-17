import { createClient } from '@supabase/supabase-js'

// Fallback to placeholder values so the build succeeds even if env vars aren't
// set yet — the sync will fail gracefully at runtime and show a red dot.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseKey)
