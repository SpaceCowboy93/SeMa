# IndexedDB recovery checkpoint audit

15 October 2026. Local implementation; **not deployed or approved for original devices**.
This supersedes the localStorage capacity finding in `STAGING_RECOVERY_AUDIT.md`.
The staging, provenance, original-device export and release prerequisites there remain.

## Preservation and scope

Before edits, all **51** existing modified/nonignored untracked files (the earlier
46 plus five audit additions) were copied and SHA-256 verified under
`.backups/indexeddb-recovery-2026-10-15T17-24-32-167Z/files/`.
`manifest.json` and `starting-diff.patch` preserve the starting work. Earlier
backups were not overwritten, reset or cleaned. Application changes extend the
existing Phase 1–3 fixes; the original versions remain in this snapshot.

No production browser, original phone storage, Supabase data, deployment, push,
rollback or live QA script was accessed or changed. Native browser verification
uses a standalone storage module, invented data and a new headless browser
context. Only a loopback HTTP fixture is allowed. It never loads SeMa itself,
environment files, account sessions or an existing browser profile.

## Change

- `indexed-checkpoint.ts` stores one versioned, checksummed complete bundle in
  IndexedDB database `sema-recovery`, store `checkpoints`, keyed by household/state.
  State, baseline, pending keys, unbased records and conflict history commit
  together. Success requires transaction completion with confirmed `strict`
  durability; a successful `put` request alone cannot acknowledge anything.
- Read/compare-token/write share one transaction. Competing tabs cannot both
  replace the same generation. A stale writer returns failure and preserves the
  winner, rather than acquiring its token and overwriting its work. The losing
  tab keeps its visible edits and warning; these may still need a separate manual
  copy if that tab cannot persist. This is safe refusal, not automatic tab merging.
- `durable-cache.ts` imports v1, scoped mirrors or valid legacy journal data
  without modifying/deleting any localStorage entry. Interrupted legacy journal
  imports retain conservative pending state. Invalid/unsupported legacy journals
  or IndexedDB records stop initialization; an existing bad record never causes
  fallback to an older mirror. Ownerless v1 ownership is claimed atomically in
  IndexedDB, without altering the old localStorage ownership marker.
- Frozen-source fingerprints detect an older client changing legacy data before
  initialization or before/after a checkpoint. Detection pauses saving. There is
  no atomic transaction across IndexedDB and an old client's localStorage;
  **close other builds/tabs after preserving their work before recovery**.
- The sync hook awaits durable checkpoints before sending or acknowledging work.
  Revision/authentication guards prevent asynchronous commits from replacing
  newer edits or hydrating an obsolete account. A failed acknowledgement retains
  the prior dirty checkpoint; a later server read reconciles an already-saved
  event without creating it again. Failed writes remain visible failures.
- Zustand automatic writes use the same complete bundle when the hook is absent,
  including offline. They do not maintain localStorage mirrors. Hydration defaults
  are not treated as authored changes. Queued candidates are copied at enqueue
  time, and conflict archives are retained. Reopening cannot silently replace an
  unpersisted in-memory candidate with an older saved snapshot.

The old localStorage implementation remains as a compatibility reader/tested
legacy format. Production store/hook imports now use the durable adapter; its
automatic persistence path never calls the old journal writer.

## Measured storage

The standalone native Chromium test measured the **same synthetic** checkpoint
in both serializers: snapshot 1,720,222 characters, state and baseline populated,
no conflict archives. These are serialized character counts, **not measured disk
bytes, browser quotas, real device contents or a guarantee of available space**.

| Requirement | Previous active scheme | New active scheme |
| --- | ---: | ---: |
| Snapshot copies | 6 (mirrors 2 + two slots 4) | 2 (one state/baseline bundle) |
| Serialized checkpoint/mirror characters including metadata/keys | 10,322,463 in localStorage | 3,440,837 in IndexedDB |
| New localStorage writes after migration | Full mirrors/journal on each save | 0 |
| Existing legacy bytes removed | — | 0 |

The working representation is approximately **66.7% smaller**. Retaining all
legacy bytes means total storage initially **grows**: in this model about 13.76M
characters combined, not 3.44M total. A device with only the two mirrors keeps
those approximately 3.44M characters and adds the IndexedDB bundle. Optional v1,
quarantines, unrelated origin storage and archives add their existing footprint.
Transaction copy-on-write overhead and browser encoding require extra headroom.
The new path removes dependence on free localStorage capacity; it cannot create
free disk space or make IndexedDB quota failure impossible.
Activity-feed and notification-preference caches still use localStorage; their
separate writes can continue failing if that storage is already full. This change
moves the shared synchronization checkpoint, not every browser setting.

Native measurement: Chromium **151.0.7922.34**, strict durability, two real tabs,
exactly one competing writer, abort after `put` success, prior complete checkpoint
restored after tab closure. Zero nonlocal requests forwarded. Results are in
`storage-measurement.json` in the new backup directory. Reproduce locally:

```powershell
node scripts/test-indexed-checkpoint-browser.cjs
```

The implementation follows the [IndexedDB transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle).
Browser/OS eviction and sudden hardware failure remain outside this local test.

## Tests and verification

New suites cover quota exceptions, abort after request success, migration from
all supported legacy formats, failed first migration/retry, unsupported/corrupt
records, immutable queued edits, old-client interference, ownership isolation,
strict-durability refusal, invalid serialization, offline edits with/without the
hook, missing baselines, checklist merge, conditional server retry, edits during
acknowledgement, auth changes and export restoration.

Existing localStorage fault-injection suites retain their legacy adapter via an
explicit test boundary in `setup.ts`. New IndexedDB suites unmock that boundary
and mount the production adapter with a fresh transactional `IDBFactory`. The
native Chromium test verifies the actual browser transaction primitive separately.
Supabase remains mocked; none of these tests exercise hosted synchronization.

Final `npm run quality` **passed with exit code 0** on the final implementation:

- **1,077 tests passed in 62 files**, no skips, including **31** new IndexedDB
  regression tests. The three new suites also passed separately against the
  production adapter. Existing React ref/act warnings remain in passing UI tests.
- TypeScript passed; full lint passed with the **20 existing warnings**; the
  optimized Next.js build passed. No deployment command was invoked.
- Native Chromium verification passed the five storage scenarios described above.
- New scripts passed syntax checks; the repository secret scan found zero
  findings in 261 text files; `git diff --check` passed (Git also reports existing
  Windows line-ending/config-permission notices).

The combined final log is `quality-final.log` in the new backup directory.
Separate gate logs, the measurement and preservation manifests are retained there.
All 51 starting snapshots were re-read/hash-verified, as were all 46 files in the
earlier staging-audit backup. Six starting files were intentionally extended for
this work; the other 45 retained their starting bytes. HEAD remains
`d5217f2d7efc2fbb29b7a76e2437f8f86ab34db4`; nothing was committed or pushed.

## Backup and restoration preparation

The existing `export-sync-recovery.js` and `verify-sync-export.cjs` remain
unchanged for legacy exports. After migration, also use the prepared
`export-indexed-recovery.js` in a **disposable recovery browser**, while offline
and with editing stopped, to download a committed IndexedDB snapshot. It uses a
read-only transaction, refuses an absent database and reads no auth storage.
Do not execute it on original devices as part of this local task.

Verify that private file locally:

```powershell
node scripts/verify-indexed-export.cjs 'C:/private-backups/sema-indexed-recovery.json'
```

The verifier checks export/record integrity and prints only counts/digests. It
does not certify application schema correctness or reconcile data with the server.
Regression tests export, verify and restore a synthetic checkpoint into a fresh
database, retaining notes, checklist completion and pending keys. **No general
import/restore command is shipped or run**: a real restore needs private record
comparison and rehearsal into a disposable copy. Neither exporter captures
unpersisted edits, open editor drafts or queued photo files; preserve those
separately. No backup has been obtained from an original device in this task.

## Remaining blockers and next safe action

1. **Original-device preservation and reconciliation remain required.** Before
   loading recovery code, manually obtain and verify the existing read-only raw
   exports from both original browsers, copy open drafts/unpersisted edits and
   retain a current verified server export privately, following the existing
   recovery plan. Keep originals unchanged until those copies are confirmed.
2. **Isolated staging is still unavailable/unverified.** Use the staging plan in
   `STAGING_RECOVERY_AUDIT.md`; the existing preview shares production Supabase
   and cannot host write tests. Provisioning/deployment is separate future work.
3. Rehearse migration and restore in disposable local target-browser copies with
   realistic synthetic sizes, including archive/media growth. Verify iOS/Safari,
   Android and installed-PWA behavior as applicable. Only Chromium native storage
   is verified here. Missing strict-durability support deliberately blocks saving.
4. Require verified backend provenance, household mapping and original pending
   record review. Cache scope still uses household/state IDs, not backend ref.
   Missing baselines/local-only records can represent deletions and remain held
   for explicit review; capacity work does not authorize automatic conflict choices.
5. IndexedDB is subject to disk quota and origin eviction. First failed writes
   can leave new edits only in memory; keep the tab open and copy them separately.
   Frozen legacy data is not a backup of post-migration edits. Complete deletion
   or eviction of the database cannot be distinguished from first migration using
   those frozen bytes alone: do not delete it or automatically trust a stale
   legacy source after storage loss; compare verified exports with the server.
6. Archives remain unbounded and nothing is pruned. This uses full snapshots,
   not an operation log; counter increments and sustained write contention retain
   the previously documented limitations. A losing tab requires preservation and
   review, rather than automatic reacquisition of the winning checkpoint.
7. **A code-only rollback to an old build is unsafe after new local edits.** Old
   builds read frozen mirrors and cannot see IndexedDB-only work. Preserve both
   exports and unsaved edits before any future rollback; prefer a forward patch
   retaining this reader. No rollback, deployment or original-device update is
   authorized or performed by this task.

Next: rehearse this verified local storage path in disposable target browsers and
establish isolated staging before considering original-device recovery or deployment.
