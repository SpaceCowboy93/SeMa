// PREPARED ONLY. Run offline in a disposable recovery browser after migration.
// Reads SeMa's existing IndexedDB checkpoint store only; no auth/network/imports.
// Use export-sync-recovery.js separately for the unchanged legacy localStorage.
void (async () => {
  if (!indexedDB.databases) throw new Error('Cannot inspect existing databases safely')
  if (!(await indexedDB.databases()).some(db => db.name === 'sema-recovery')) throw new Error('No recovery database exists')
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('sema-recovery')
    // A concurrent deletion must not cause this read-only exporter to create it.
    request.onupgradeneeded = () => request.transaction.abort()
    request.onerror = () => reject(new Error('Cannot read existing recovery database'))
    request.onsuccess = () => resolve(request.result)
  })
  let entries
  try {
    entries = await new Promise((resolve, reject) => {
      const tx = db.transaction('checkpoints', 'readonly'), store = tx.objectStore('checkpoints')
      const keys = store.getAllKeys(), values = store.getAll()
      tx.onabort = () => reject(new Error('Read aborted'))
      tx.oncomplete = () => resolve(keys.result.map((key, index) => ({ key, value: values.result[index] })))
    })
  } finally { db.close() }
  if (!entries.length) throw new Error('No recovery records')
  const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))))
    .map(byte => byte.toString(16).padStart(2, '0')).join('')
  const at = new Date().toISOString(), payload = JSON.stringify({ origin: location.origin, at, entries })
  const backup = { format: 'sema-indexed-checkpoint-export', version: 1, payload, sha256: await digest(payload) }
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `sema-indexed-recovery-${at.replace(/[:.]/g, '-')}.json`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  console.info('SeMa IndexedDB export prepared:', { entries: entries.length, sha256: backup.sha256,
    reminder: 'This is the committed checkpoint, not unpersisted edits or drafts. Verify the file privately and preserve those separately.' })
})().catch(() => console.error('SeMa IndexedDB export failed. Preserve the browser; do not clear storage or reload.'))
