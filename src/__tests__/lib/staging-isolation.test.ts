import { expect, it } from 'vitest'
import { inspectStagingConfig, isAllowedStagingRequest } from '../../../scripts/check-staging-isolation.cjs'

// Synthetic project/host only. These are not provisioned resources or credentials.
const ref = 'abcdefghijklmnopqrst'
const config = () => ({ format: 'sema-staging-config', version: 1, environment: 'staging', projectRef: ref,
  browserBackendUrl: `https://${ref}.supabase.co`, serverBackendUrl: `https://${ref}.supabase.co`,
  storageBackendUrl: `https://${ref}.supabase.co`, serverCredentialProjectRef: ref,
  appUrl: 'https://sema-isolated-fixture.invalid', vercelProjectId: 'prj_SyntheticStaging',
  syntheticDataOnly: true, externalEffectsDisabled: true })

it('accepts matching synthetic staging declarations without claiming runtime isolation', () => {
  expect(inspectStagingConfig(config())).toEqual({ configurationSafe: true, failures: [] })
  expect(inspectStagingConfig(config())).not.toHaveProperty('runtimeIsolationVerified', true)
})

it.each(['neyhoodxeumpbxekskej', 'ziyuqxoygtgzcjlsqfwc'])('rejects the production/legacy backend %s in every request path before network use', production => {
  const input = config()
  for (const path of ['/auth/v1/user', '/rest/v1/couple_state', '/storage/v1/object/public/event-photos/private.jpg', '/realtime/v1/websocket']) {
    expect(isAllowedStagingRequest(input, `https://${production}.supabase.co${path}`)).toBe(false)
    expect(isAllowedStagingRequest(input, `wss://${production}.supabase.co${path}`)).toBe(false)
  }
  expect(inspectStagingConfig({ ...input, projectRef: production }).configurationSafe).toBe(false)
})

it.each(['browserBackendUrl', 'serverBackendUrl', 'storageBackendUrl'] as const)('rejects a production value or URL credential in %s', key => {
  for (const url of ['https://neyhoodxeumpbxekskej.supabase.co', 'https://ziyuqxoygtgzcjlsqfwc.supabase.co',
    `https://secret:private@${ref}.supabase.co`, `https://${ref}.supabase.co?apikey=private`]) {
    expect(inspectStagingConfig({ ...config(), [key]: url }).configurationSafe).toBe(false)
  }
})

it.each([
  { environment: 'production' }, { serverCredentialProjectRef: 'neyhoodxeumpbxekskej' },
  { vercelProjectId: 'prj_9q64HO9xSEjA0haET98sPHXR6AbG' },
  { appUrl: 'https://sema-calendar.vercel.app' },
  { appUrl: 'https://sema-calendar-imf1clxxw-mateo-s-projects123.vercel.app' },
  { syntheticDataOnly: false }, { externalEffectsDisabled: false },
  { SUPABASE_SERVICE_ROLE_KEY: 'PRIVATE MUST NOT BE PRINTED' },
])('rejects unsafe declaration %j without printing its value', overrides => {
  const result = inspectStagingConfig({ ...config(), ...overrides })
  expect(result.configurationSafe).toBe(false)
  expect(JSON.stringify(result)).not.toContain('PRIVATE')
})

it('allows only the declared app and backend, including Realtime, and rejects redirect destinations and lookalike hosts', () => {
  const input = config()
  expect(isAllowedStagingRequest(input, input.appUrl + '/calendar')).toBe(true)
  expect(isAllowedStagingRequest(input, input.browserBackendUrl + '/rest/v1/couple_state')).toBe(true)
  expect(isAllowedStagingRequest(input, `wss://${ref}.supabase.co/realtime/v1/websocket`)).toBe(true)
  for (const url of [`https://${ref}.supabase.co.attacker.invalid/rest/v1/couple_state`, 'http://localhost:54321',
    'https://unknown-storage.invalid/private.jpg', 'https://sema-calendar.vercel.app/api/upload-photo',
    `https://${ref}.supabase.co:444/rest/v1/couple_state`, 'not a URL']) {
    expect(isAllowedStagingRequest(input, url)).toBe(false)
  }
  // The allowed first URL grants no permission to follow a redirect to production.
  expect(isAllowedStagingRequest(input, 'https://neyhoodxeumpbxekskej.supabase.co/redirect-target')).toBe(false)
})

it('fails closed for missing/invalid manifests and never makes a network request', () => {
  for (const input of [null, undefined, {}, [], 'not staging']) {
    expect(inspectStagingConfig(input).configurationSafe).toBe(false)
    expect(isAllowedStagingRequest(input, 'https://neyhoodxeumpbxekskej.supabase.co')).toBe(false)
  }
})
