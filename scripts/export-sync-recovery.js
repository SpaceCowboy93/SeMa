// PREPARED ONLY: run manually in the original SeMa tab's DevTools, while offline.
// Reads only SeMa data-cache keys. No network, auth reads, storage writes or imports.
// The downloaded file contains personal records; retain it privately.
void (async () => {
  const allowed = key => key === 'semacalendar-v1' || key === 'sema-legacy-cache-owner' || key.startsWith('semacalendar-v2:')
  const keys = () => Object.keys(localStorage).filter(allowed).sort()
  const names = keys()
  const values = names.map(key => ({ key, value: localStorage.getItem(key) }))
  const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  const entries = await Promise.all(values.map(async entry => ({ ...entry, sha256: await digest(JSON.stringify(entry)) })))
  if (JSON.stringify(names) !== JSON.stringify(keys()) || values.some(entry => localStorage.getItem(entry.key) !== entry.value)) {
    throw new Error('Cache changed during export. Keep the original tab open, stop editing and retry offline.')
  }
  if (!entries.length) throw new Error('No SeMa cache found. Check the original tab, browser profile and exact origin; do not reload or clear it.')
  const at = new Date().toISOString()
  const payload = JSON.stringify({ origin: location.origin, at, entries })
  const backup = { format: 'sema-device-cache-export', version: 1, payload, sha256: await digest(payload) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `sema-device-cache-${at.replace(/[:.]/g, '-')}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  console.info('SeMa cache export prepared:', { entries: entries.length, sha256: backup.sha256,
    reminder: 'Verify the downloaded file and preserve any open drafts separately before reloading.' })
})().catch(() => console.error('SeMa export failed. Keep the original tab open and preserve the device. Check storage/download access and retry offline.'))
