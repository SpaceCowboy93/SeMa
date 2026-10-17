// Offline only. Accepts the SQL editor's JSON result array or the snapshot object.
// Checks binding and exact PostgreSQL JSON text digest; prints no record contents.
const fs = require('node:fs')
const { createHash } = require('node:crypto')
const digest = (algorithm, value) => createHash(algorithm).update(value, 'utf8').digest('hex')
try {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-server-snapshot.cjs <snapshot.json>')
  const raw = fs.readFileSync(process.argv[2], 'utf8')
  let snapshot = JSON.parse(raw.replace(/^\uFEFF/, ''))
  if (Array.isArray(snapshot)) {
    if (snapshot.length !== 1) throw new Error('Invalid result count')
    snapshot = snapshot[0].snapshot
  } else if (snapshot?.snapshot) snapshot = snapshot.snapshot
  if (typeof snapshot === 'string') snapshot = JSON.parse(snapshot)
  if (snapshot?.format !== 'sema-server-state-export' || snapshot.version !== 1 ||
    snapshot.project_ref !== 'neyhoodxeumpbxekskej' || snapshot.id !== 'sema' ||
    snapshot.couple_id !== '3de918c1-fccc-454d-8618-8dce607ea4d8' ||
    typeof snapshot.state_jsonb_text !== 'string' || digest('md5', snapshot.state_jsonb_text) !== snapshot.state_md5 ||
    typeof snapshot.captured_at !== 'string' || !Number.isFinite(Date.parse(snapshot.captured_at)) ||
    typeof snapshot.updated_at !== 'string' || !Number.isFinite(Date.parse(snapshot.updated_at))) throw new Error('Invalid snapshot')
  const state = JSON.parse(snapshot.state_jsonb_text)
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error('Invalid shared state')
  const counts = {}
  for (const key of ['events', 'todos', 'partnerNotes', 'loveNotes', 'goals', 'shoppingLists']) {
    if (!Array.isArray(state[key])) throw new Error('Missing collection')
    counts[key] = state[key].length
  }
  console.log(JSON.stringify({ valid: true, capturedAt: snapshot.captured_at, updatedAt: snapshot.updated_at,
    fileSha256: digest('sha256', raw), stateSha256: digest('sha256', snapshot.state_jsonb_text), counts,
    contentsPrinted: false, scope: 'Verified shared-row export integrity and binding; not a restore rehearsal or proof of freshness.' }, null, 2))
} catch (error) {
  console.error(error.message.startsWith('Usage:') ? error.message :
    'Server snapshot verification failed. Preserve the original download and export the one verified shared row again; no data was changed.')
  process.exitCode = 1
}
