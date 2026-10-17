// Offline integrity verification. Never prints personal records or imports data.
const fs = require('node:fs')
const { createHash } = require('node:crypto')
const checksum = value => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return (hash >>> 0).toString(16).padStart(8, '0')
}
function verify(backup) {
  if (backup.format !== 'sema-indexed-checkpoint-export' || backup.version !== 1 || typeof backup.payload !== 'string' ||
    createHash('sha256').update(backup.payload).digest('hex') !== backup.sha256) throw new Error('Invalid export')
  const { entries } = JSON.parse(backup.payload)
  if (!Array.isArray(entries) || !entries.length || new Set(entries.map(entry => entry.key)).size !== entries.length) throw new Error('Invalid entries')
  let records = 0
  for (const { key, value } of entries) {
    if (key === 'legacy-v1-owner' && typeof value === 'string') continue
    if (typeof key !== 'string' || !key.startsWith('semacalendar-v2:') || value?.scope !== key || value.version !== 1 ||
      !Number.isSafeInteger(value.generation) || value.generation < 1 || typeof value.token !== 'string' ||
      typeof value.legacyFingerprint !== 'string' || typeof value.payload !== 'string' || checksum(value.payload) !== value.checksum) throw new Error('Invalid record')
    const data = JSON.parse(value.payload)
    if (!data || typeof data.state !== 'object' || !data.state || typeof data.base !== 'object' || !data.base ||
      !Array.isArray(data.pending) || !Array.isArray(data.archives)) throw new Error('Invalid checkpoint')
    records++
  }
  if (!records) throw new Error('Missing checkpoints')
  return { valid: true, records, entries: entries.length, sha256: backup.sha256, contentsPrinted: false,
    applicationSchemaAndRestoreVerified: false }
}
module.exports = { verify }
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage')
    console.log(JSON.stringify(verify(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))), null, 2))
  } catch {
    console.error('IndexedDB export verification failed; preserve the browser and retry offline.')
    process.exitCode = 1
  }
}
