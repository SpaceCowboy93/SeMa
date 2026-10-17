// OFFLINE configuration preflight only. Never reads .env/auth files or makes requests.
// A passing result is NOT proof of deployed browser/server network isolation.
const PRODUCTION_REFS = new Set(['neyhoodxeumpbxekskej', 'ziyuqxoygtgzcjlsqfwc'])
const PRODUCTION_VERCEL_PROJECT = 'prj_9q64HO9xSEjA0haET98sPHXR6AbG'
const UNSAFE_APP_HOSTS = new Set(['sema-calendar.vercel.app',
  'sema-calendar-imf1clxxw-mateo-s-projects123.vercel.app',
  'sema-calendar-flpwn8tt7-mateo-s-projects123.vercel.app',
  'sema-calendar-65vent1tz-mateo-s-projects123.vercel.app',
  'sema-calendar-7gv4617ln-mateo-s-projects123.vercel.app'])

function origin(value) {
  try {
    if (typeof value !== 'string') return null
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null
    return url.origin
  } catch { return null }
}

function inspectStagingConfig(input) {
  const failures = []
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { configurationSafe: false, failures: ['INVALID_MANIFEST'] }
  const allowedKeys = ['format', 'version', 'environment', 'projectRef', 'browserBackendUrl', 'serverBackendUrl',
    'serverCredentialProjectRef', 'storageBackendUrl', 'appUrl', 'vercelProjectId', 'syntheticDataOnly', 'externalEffectsDisabled']
  if (Object.keys(input).some(key => !allowedKeys.includes(key))) failures.push('UNEXPECTED_FIELDS_OR_CREDENTIALS')
  if (input.format !== 'sema-staging-config' || input.version !== 1 || input.environment !== 'staging') failures.push('NOT_STAGING_MANIFEST')
  const ref = input.projectRef
  if (typeof ref !== 'string' || !/^[a-z]{20}$/.test(ref) || PRODUCTION_REFS.has(ref)) failures.push('UNSAFE_PROJECT_REF')
  const expected = `https://${ref}.supabase.co`
  for (const key of ['browserBackendUrl', 'serverBackendUrl', 'storageBackendUrl']) {
    if (origin(input[key]) !== expected) failures.push('BACKEND_ORIGIN_MISMATCH')
  }
  if (input.serverCredentialProjectRef !== ref) failures.push('SERVER_CREDENTIAL_PROJECT_MISMATCH')
  const appOrigin = origin(input.appUrl)
  if (!appOrigin || UNSAFE_APP_HOSTS.has(new URL(appOrigin).hostname) || new URL(appOrigin).hostname.endsWith('.supabase.co')) failures.push('UNSAFE_APP_ORIGIN')
  if (typeof input.vercelProjectId !== 'string' || !/^prj_[A-Za-z0-9]+$/.test(input.vercelProjectId) ||
    input.vercelProjectId === PRODUCTION_VERCEL_PROJECT) failures.push('DEDICATED_STAGING_APP_REQUIRED')
  if (input.syntheticDataOnly !== true || input.externalEffectsDisabled !== true) failures.push('FIXTURE_OR_SIDE_EFFECT_GUARD_MISSING')
  return { configurationSafe: failures.length === 0, failures: [...new Set(failures)] }
}

// Predicate for a FUTURE interceptor/egress guard. Does not install a guard.
// Recheck every redirected destination; server and browser need independent guards.
function isAllowedStagingRequest(input, requestUrl) {
  if (!inspectStagingConfig(input).configurationSafe) return false
  try {
    const url = new URL(requestUrl)
    if (url.username || url.password || url.port || url.hash) return false
    const backend = `${input.projectRef}.supabase.co`
    return ((url.protocol === 'https:' || url.protocol === 'wss:') && url.hostname === backend) ||
      (url.protocol === 'https:' && url.origin === origin(input.appUrl))
  } catch { return false }
}

module.exports = { inspectStagingConfig, isAllowedStagingRequest }
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Invalid arguments')
    const fs = require('node:fs')
    const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''))
    const result = inspectStagingConfig(input)
    console.log(JSON.stringify({ ...result, runtimeIsolationVerified: false, productionAccessTested: false,
      readyForLiveTesting: false, credentialsPrinted: false,
      limitation: 'Configuration declarations only. Requires independent deployed identity, credential, artifact and browser/server egress verification.' }, null, 2))
    if (!result.configurationSafe) process.exitCode = 1
  } catch {
    console.error('Staging preflight failed. Supply one nonsecret staging manifest; no network or data changes were made.')
    process.exitCode = 1
  }
}
