// Offline verification only. Prints counts and digests, never cache contents.
const fs = require('node:fs')
const { createHash } = require('node:crypto')
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex')
try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-sync-export.cjs <export.json>')
  const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  if (backup.format !== 'sema-device-cache-export' || backup.version !== 1 || typeof backup.payload !== 'string' ||
    digest(backup.payload) !== backup.sha256) throw new Error('Export checksum or format is invalid')
  const payload = JSON.parse(backup.payload)
  if (!Array.isArray(payload.entries) || !payload.entries.length || new Set(payload.entries.map(entry => entry.key)).size !== payload.entries.length) {
    throw new Error('Missing or duplicate export entries')
  }
  for (const entry of payload.entries) {
    if (typeof entry.key !== 'string' || !(entry.key === 'semacalendar-v1' || entry.key === 'sema-legacy-cache-owner' || entry.key.startsWith('semacalendar-v2:')) ||
      typeof entry.value !== 'string' || digest(JSON.stringify({ key: entry.key, value: entry.value })) !== entry.sha256) {
      throw new Error('An export entry is invalid')
    }
  }
  console.log(JSON.stringify({ valid: true, entries: payload.entries.length, sha256: backup.sha256, contentsPrinted: false }, null, 2))
} catch (error) {
  // Do not expose parsing errors, paths or personal data from the input file.
  console.error(error.message.startsWith('Usage:') ? error.message : 'Export verification failed; preserve the original device and retry the export offline.')
  process.exitCode = 1
}
