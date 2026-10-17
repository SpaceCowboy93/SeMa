// Fail before compiling if this isolated repository is pointed at another backend.
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} })
const expected = 'https://wwxdinkdjkjiqzynfbdk.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
let validKey = key.startsWith('sb_publishable_')
if (key.split('.').length === 3) {
  try { const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')); validKey = payload.ref === 'wwxdinkdjkjiqzynfbdk' && payload.role === 'anon' } catch { /* reject */ }
}
// CI may use a noncredential placeholder because builds do not access app data.
if (process.env.CI === 'true' && key === 'placeholder-anon-key') validKey = true
if (process.env.NEXT_PUBLIC_SUPABASE_URL !== expected || !validKey) {
  console.error('V2 build refused: configure the exact V2 endpoint and its public key. Values have not been printed.')
  process.exit(1)
}
console.log('Verified: isolated Supabase V2 build target.')
