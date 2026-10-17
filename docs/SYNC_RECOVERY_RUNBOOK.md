# Stale-device synchronization recovery — local preparation, 15 October 2026

**No live recovery has been performed by this continuation.** Neither original
device was attached, reloaded, cleared or edited. No Supabase reads/writes, SQL,
migrations, live QA records, environment changes, commits, pushes, merges or
deployments were performed. Public Supabase documentation was consulted.

## Starting state and preservation

- Branch: `hotfix/production-sync`; HEAD: `d5217f2d7efc2fbb29b7a76e2437f8f86ab34db4`.
- The existing working tree contained extensive unfinished recovery, editor and
  test changes. All were retained and extended in place.
- Before editing, every tracked modification and nonignored untracked file was
  copied to `.backups/sync-continuation-20261015-134702/`, with the initial binary
  Git diff. This snapshot is ignored and is not a device or database backup.
- Existing `scripts/qa-live-sync.mjs` and `scripts/qa-live-sync-report.json` were
  preserved. They are historical live QA artifacts; do not execute them.
- The default Playwright config continues to require loopback and exclude the
  historical live synchronization spec. Vitest uses mocked Supabase.

## Confirmed cause and limits of evidence

The original global conflict barrier is documented in
`production-sync-investigation.md` and corrected at HEAD. The remaining barrier
was collection-wide: one conflicting To-Do could hold every pending To-Do,
including unrelated additions. A legacy cache with no baseline could also yield
a whole-collection resolution, making a broad stale-version choice dangerous.
An empty legacy pending marker was also trusted without requiring a matching
baseline, allowing an initial remote pull to replace possibly unsent local work.
Offline regressions reproduce these code paths and verify their correction.

The follow-up verification reproduced a second unsafe interpretation of that
mismatch: an old cached record beside a newer separately saved baseline could
be treated as a new addition and resurrect a server deletion. Merely inferring
a pending flag was insufficient. Startup now checks the original marker before
changing it and discards trust in the baseline for unmarked, differing fields.
The first checkpoint must also stage before any legacy pending-marker write:
otherwise an interruption could make the next launch trust the same baseline.
Both failures were demonstrated with mocked storage and writes before fixing
them. The same-tab recovery path applies the same trust check after a failed
first checkpoint; it does not depend on restarting.

The unfinished work also addresses independently reproduced data-safety defects:
valid moods use `(userId,date)`, not `id`; rejected remote fields must not become
empty defaults on a later save; linked Dream/Calendar checklists must preserve
identity and completion; open editor drafts must rebase before saving; linked
delete conflicts must hold every affected half; and local storage failures must
not acknowledge work that was not retained.

**The exact original laptop/phone condition is still unconfirmed.** The latest
existing original-device report (`.backups/production-real-device-readonly-report.md`)
localized missing writes upstream of Supabase but did not obtain the original
device caches. Fresh-session successes do not prove the state of either original
cache. The historical October 9 publication finding was superseded by the October
11 publication recheck. Do not apply the old proposed publication SQL.

## Final recovery behavior

- Conflict review identifies records, fields, both versions and linked groups.
  Both versions are archived before an explicit choice replaces a local version.
  Legacy checklist text is visible during review.
- Resolution re-reads shared data and rejects an outdated choice if either
  reviewed version changed. Choosing one record leaves other choices pending.
- Differing local legacy records receive individual review groups. A local-only
  record may be unique work or a stale copy of a deletion, so it is held for
  explicit review. Unknown-baseline record IDs persist with checkpoints across
  partial choices and reloads. Server-only additions are imported, never treated
  as local deletion intent.
- Empty legacy pending markers are cross-checked against the actual baseline.
  Missing or mismatched baselines cannot silently erase possibly unsent records.
  Startup checkpoints the pre-hydration cache, so a genuinely fresh browser's
  generated defaults remain distinguishable from older local work.
- A legacy field that differs from its saved baseline without a corresponding
  recorded pending marker has **no trusted baseline**, even when a `:base` value
  exists. Its local records remain visible and require review; server copies
  remain unchanged in outgoing data. Matching clean fields and independently
  recorded pending changes keep their usual behavior. Complete versioned
  checkpoints retain their bundled baseline. These checks run before rewriting
  legacy metadata and again for callers recovering in the same tab.
- An unresolved group retains its local version in the visible store and its
  remote version in any outgoing payload. Independent records in the same
  collection can synchronize. Their baselines advance without acknowledging the
  unresolved records.
- Dream/Calendar/To-Do references form one review group, including links found
  in older baseline or newer remote snapshots. A linked operation is never
  partially published while its conflict is unresolved.
- Every write starts from a fresh server read, preserves unknown server JSON
  fields, and is conditional on state ID, couple ID and the exact `updated_at`.
  Zero affected rows trigger bounded re-read/rebase attempts, never an
  unconditional fallback. Edits made while saving stay pending.
- Versioned two-slot checkpoints bundle state, baseline, pending keys, recovery
  history and unknown-baseline records. Checksums detect accidental corruption.
  Staging precedes compatibility mirrors and commit-pointer acknowledgement.
  Interrupted writes retain conservative pending markers; damaged bytes are
  quarantined before reuse; unsupported versions are preserved and block saving.
- Storage failure blocks sending/acknowledgement and displays a persistent retry
  warning. A fully failed storage write leaves edits only in memory: keep the tab
  open. Polling/foreground/online fallback and queued Realtime refreshes remain.
- Duplicate top-level identities are rejected before hydration or synchronization
  can collapse distinct records into one identity.
- Rejection of duplicate top-level IDs pauses the full snapshot, including an
  unrelated save, rather than guessing how to repair it. Existing duplicate cache
  bytes are quarantined intact before replacement. Colliding additions on two
  devices receive explicit record review. Duplicate nested IDs cause atomic
  conflict review when both arrays changed; the merge never silently deduplicates
  their distinct values through a keyed map. Invalid/quarantined data needs manual
  comparison using the exports; this recovery does not automatically repair it.

## Original laptop and phone: exact preservation-first procedure

These steps are a future operator procedure, **not authorization to run live
recovery**. Stop for review of the exports, proposed record choices and rollback
manifest before any live data change or deployment.

1. Put **both originals offline**, including mobile data. Keep existing app tabs
   and browser profiles open. Stop editing. Do not reload, sign out, reinstall,
   clear storage, unregister workers, switch origins or load a fresh deployment.
   Photograph/copy any currently open editor drafts separately: drafts or quota-
   failed edits may exist only in memory and are not in localStorage.
2. On the **original laptop tab at its original exact origin**, open browser
   DevTools without navigation. Inspect the prepared
   `scripts/export-sync-recovery.js`, then run its contents manually in that tab's
   Console while offline. It reads only `semacalendar-v1`,
   `sema-legacy-cache-owner` and all `semacalendar-v2:*` keys, including baseline,
   pending, checkpoint and quarantine bytes. It downloads a private JSON file;
   it does not read authentication storage, write storage or make requests.
   Confirm the download exists. If no cache is found or storage is inaccessible,
   stop and preserve the original profile; do not try another login/reset.
3. Do the **same for the original phone browser/PWA storage context**, using its
   own Web Inspector/remote debugging attachment while offline. A new browser tab
   or different browser/PWA can have a different cache. If that storage context
   cannot be attached safely, stop and obtain an appropriate device/profile
   backup and read-only access; do not use a fresh session as its substitute.
4. Copy each export privately to offline storage, label it laptop/phone and keep
   a second copy. On a workstation run:
   `node scripts/verify-sync-export.cjs <path-to-that-export.json>`.
   Require `valid: true`; retain its SHA-256 and entry count. The verifier prints
   no contents. A valid export proves consistency of the exported cache strings,
   not the existence of unpersisted drafts or browser/OS disk durability.
5. Separately obtain a **fresh, read-only server snapshot** of the verified
   household's `state` and `updated_at`, and preserve it privately with a hash.
   Keep original devices offline. Compare both device exports, pending keys,
   baselines and server records locally. Identify unique local work, newer remote
   work, ambiguous remote deletions, broken links and invalid/quarantined data.
   Verify actual loaded bundle versions. Do not infer the current server from
   old reports. Prepare a per-record choice manifest including linked IDs and
   before/after values; never produce an entire stale-cache upload.
6. **Stop and report for explicit live authorization** with the actual export
   evidence, exact planned records, linked groups, server version, quality gates,
   remaining risks and per-record rollback. Local completion of this work does
   not authorize deploying it or running these future steps against live data.
7. Before reconnecting an original, establish a method-aware mutation blocker
   on that original browser context while it is still offline. It must block
   shared-data POST/PATCH/PUT/DELETE and application API mutations, allowing only
   reads and authentication login/refresh requests without logging credentials.
   A simple UI pause or a blocked Realtime channel is insufficient: the old
   bundle can save immediately on an online event. If interception cannot be
   established safely on a particular phone/browser/PWA, leave it offline and
   stop for a separately reviewed recovery path. Do not substitute a fresh tab.
   Only after approval and an authorized release of the verified recovery code,
   load and verify that code in the original context under this write block.
   Check its recovered cache against the export and re-review the exact record
   manifest against a fresh server read. Permit writes only through a narrow
   guard for the approved record changes, preserving every unrelated field and
   requiring the reviewed server version; block anything outside that manifest.
   Start with the laptop whose unique local work needs review; keep the phone
   offline until its own guarded turn. Use one tab per original
   storage context. Download recovery history before and after every reviewed
   group. Keep local-only ambiguous records pending unless explicitly chosen.
   Choose the remote version for confirmed stale copies and the local version
   only for specifically reviewed work. Checkpoint failure means stop, keep the
   tab open and preserve drafts; do not clear storage to make room.
8. Verify the conditional write affected exactly one shared row and that only
   approved logical record changes occurred. Compare against the latest server
   snapshot, including unrelated/unknown fields. If a version changed during
   review, review again. Then perform the same per-record process on the phone,
   retaining its own unique work. Cross-check real records on both devices;
   create no live QA records. Retain all exports and history until reconciliation
   is explicitly accepted.

## What would change and how to roll back

**Current continuation:** local source, tests, package script and documentation
only. Original QA files are unchanged. There is no live data rollback to perform.
The ignored initial snapshot preserves the exact unfinished starting work.

**Future approved recovery:** local scoped cache/checkpoint/mirror keys gain
complete recovery bundles and history. The original v1 cache is retained. An
explicit remote choice replaces only reviewed local records after archiving
both versions; by itself it causes no server change. Independently safe pending
edits may synchronize, and a local choice schedules its reviewed record changes.
The API updates the existing shared row's JSON `state` and `updated_at`; because
that schema stores a single JSON document, the wire payload contains a document
rebuilt from the latest server state, preserving unresolved server versions and
unrelated fields. It is never a raw stale-cache replacement. No schema, RLS,
publication, membership, identity or environment changes are required.

Before each approved write retain the server before-state, exact changed record
IDs/linked groups, intended after-state and returned timestamp. To undo it, pause
writers and export both devices again. Re-read the current shared row. Apply the
inverse **only for those records and only if their current values still match
the approved after-values**. Preserve subsequent partner edits and all unrelated
records; version-condition the inverse write on the newly read `updated_at` and
verify one affected row. If values changed, prepare another explicit conflict
review instead of restoring the whole old server snapshot. Restore local
records from downloaded history/export through reviewed edits; do not blindly
import a full backup or restore raw keys into an online original device.

## Remaining limits

- Actual original-device contents, current loaded bundles and current server
  state still need the read-only preservation/comparison steps above.
- localStorage is finite and browser/OS eviction or power loss can defeat it.
  Checkpoint checksums detect accidental corruption, not malicious modification.
  Two slots plus large recovery history increase storage requirements; exports
  are essential, and quota recovery never permits automatic deletion of history.
  The tests verify safe failure, not that the original devices have enough free
  storage for their actual data. If a complete checkpoint will not fit, keep
  writes blocked and preserve the exports; a separate storage/recovery approach
  is required before enabling synchronization on that device. Clearing original
  data to make the new checkpoint fit is not a recovery step.
- Concurrent tabs cannot obtain an atomic compare-and-swap on localStorage. The
  checkpoint detects some competing writes; use one tab per device during
  recovery. Remote conditional writes still protect the shared row.
- Older clients do not understand the new checkpoint's unknown-baseline metadata.
  Do not downgrade/reopen an older bundle against an actively recovered cache;
  preserve/export first and review a rollback separately.
- A snapshot counter cannot distinguish two equal concurrent increments from
  one increment; additive counter operations need a separate design. No counter
  schema or live data change is included here.
- Per-record choices select the complete displayed record, including linked
  members. Array order conflicts can require collection-level review because
  order has no individual record identity. No automatic latest-writer choice is
  made for incompatible values.
- An inconsistent legacy field is treated conservatively as unbased. This may
  require review of multiple stale copies as well as genuinely unique work in
  that field. A corrupt/duplicate remote snapshot pauses the whole write path;
  it is different from an ordinary record conflict that can be isolated safely.

## Validation

### Follow-up verification from the existing completed command

At the follow-up request, the previous full test process had already exited
successfully (979 tests, 55 files); no Node test process remained to resume. The
existing tree and logs were retained. New verification logs and before-change
copies are under `.backups/sync-reverification-20261015-141124/`.

This continuation changes production behavior only in `src/lib/couple-cache.ts`
and `src/store/useAppStore.ts`: distrust inconsistent legacy baselines before
rewriting markers, stage the first checkpoint before legacy mirror writes, and
apply the same trust check if the tab continues after storage recovers.
Regression additions are in `hooks/background-sync-recovery.test.ts`,
`hooks/security-sync.test.ts`, `lib/background-conflict-groups.test.ts` and
`lib/sync-recovery-checkpoint.test.ts` under `src/__tests__/`. Recovery documentation
is updated in this report and `production-sync-investigation.md`. All earlier
unfinished changes remain in place.

Two failing diagnostic runs demonstrated the unsafe outgoing record before its
fix (`inconsistent-legacy-before.log`, `startup-interruption-before.log`). Final
runs below execute complete suites without filtering or skipping tests. The
startup regression covers all six checkpoint writes both with and without a
restart. Duplicate tests cover rejected remote duplicates, exact quarantine
bytes, cross-device ID collisions and nested duplicate values surviving review.

| Required behavior | Regression evidence and exact scope |
| --- | --- |
| Conflicted records do not block unrelated records | `background-sync-recovery` saves independent records in the same collection and independent linked pairs while another group remains pending. |
| Legacy records without a trusted baseline are not automatically uploaded | Legacy and falsely clean records remain pending across restart and partial resolution; inconsistent separately saved bases are ignored before markers change. |
| Local-only work and newer shared records are preserved | Visible local versions, new partner records and remote versions in outgoing payloads are checked together. An explicit choice is revalidated against a fresh read. |
| Interrupted writes recover safely | Checkpoint tests cover staged/committed envelopes, corrupted/dropped writes, quarantine, unsupported versions and quota failures; startup tests cover all six write interruptions in the same tab and after restart. Browser/OS eviction and total storage failure remain outside durability guarantees. |
| Linked Dream/Calendar/To-Do operations remain consistent | Connected groups include all three record types. Pair resolutions, linked deletions, independent pair writes, editor drafts and checklist IDs/completion are covered. The client does not silently repair already corrupt server links. |
| Duplicate identities do not silently overwrite data during sync | Invalid top-level snapshots stop writes and raw local duplicates are quarantined intact. Concurrent additions with one ID require a choice. A nested duplicate array is retained in whole-record conflict review instead of being collapsed by a map. Manual repair may still be needed. |

Focused recovery/cache/editor/export suite:
`npm test -- <18 focused test paths> --maxWorkers=2 --minWorkers=2` — **275 passed**.
The exact expanded command is retained in
`.backups/sync-reverification-20261015-141124/focused-tests-final.log`.
All evidence filenames in the table below are under that same reverification
directory. Earlier successful results (257 focused / 979 full) remain retained
under the original continuation directory; these new complete runs include the
additional baseline, interruption and duplicate regressions.

| Gate | Result | Evidence under the snapshot directory |
| --- | --- | --- |
| Focused tests | 275 passed, 18 files, no skipped tests | `focused-tests-final.log` |
| Full Vitest suite, `npm test -- --maxWorkers=2 --minWorkers=2` | 997 passed, 55 files, no skipped tests | `full-tests.log` |
| `npm run typecheck` | Passed | `typecheck.log` |
| `npm run lint` | Passed, 20 existing warnings | `lint.log` |
| `npm run build` | Passed, 36 pages generated | `build.log` |
| `git diff --check` | Passed; existing LF/CRLF warning only | `diff-check-final.log` |
| `npm run scan:secrets` | Passed, 242 text files, zero findings | `secret-scan-final.log` |

The source secret scan covers tracked and nonignored untracked files, including
the historical QA files. It is a credential-pattern scan, not a guarantee of no
secrets; ignored environment files, backups, build output and Git history are
excluded. No credential values are printed. The first test attempt required a
sandbox escalation because esbuild could not read the parent directory; local
test/compiler/lint/build commands then ran successfully. A TypeScript storage
adapter return-type error was corrected with a synchronous type guard; the
actual adapter remains synchronous and yields no account-switch window.
The final production build generated all 36 pages. Live browser/QA tests were
not executed. Test output retains existing Vite deprecation, mocked push and
React `act` warnings; none produced a failure. The working branch and HEAD remain
unchanged and nothing is staged. `preservation-check.json` verifies both original
QA artifact hashes against the initial snapshot without printing their contents.

The first full run had 970 passes and four failures originating from the previously
documented preview test's dynamic-import timeout and cascading renders. The
preview test now imports components during collection, outside individual test
timeouts. Its 14 original assertions pass unchanged; no test is skipped and no
timeout increased. The three export tests verify exact Unicode/raw checkpoint
preservation, excluded auth storage, zero network/storage mutations, refusal of
changing/empty caches and detection of tampering without printing private data.

Both existing QA files still match the starting snapshot's SHA-256:

- `scripts/qa-live-sync.mjs`:
  `201ea79379250c6bdfd3fbb7c90c443d2ed8fbf6789341b477e88fb00c8c978e`.
- `scripts/qa-live-sync-report.json`:
  `4a18aa170ebd02d8ec0392ace6f0a2a8c0fd61d3b2fc119800daeaa006f792d9`.

## Working-tree file inventory

This includes the pre-existing unfinished changes; it is not a claim that this
continuation authored all of them. No files are staged and HEAD is unchanged.

Application behavior:

- `src/hooks/useSupabaseSync.ts`
- `src/lib/couple-cache.ts`, `src/lib/shared-state.ts`, `src/lib/sync-merge.ts`
- `src/lib/sync-checkpoint.ts`, `src/lib/draft-merge.ts`, `src/lib/dream-checklist.ts`
- `src/store/useAppStore.ts`, `src/types/index.ts`
- `src/app/(app)/layout.tsx`
- `src/components/SyncConflictPanel.tsx`, `src/components/SyncSafetyWarning.tsx`
- `src/components/calendar/EventModal.tsx`
- `src/components/ui/CategoryHub.tsx`, `src/components/ui/FullCreateSheet.tsx`,
  `src/components/ui/DraftConflictNotice.tsx`

Tests:

- `src/__tests__/hooks/background-sync-recovery.test.ts`, `security-sync.test.ts`,
  `dream-calendar-sync.test.ts`
- `src/__tests__/lib/background-conflict-groups.test.ts`,
  `phase-one-data-safety.test.ts`, `sync-recovery-checkpoint.test.ts`,
  `device-cache-export.test.ts`
- `src/__tests__/components/SyncConflictPanel.test.tsx`,
  `SyncSafetyWarning.test.tsx`, `dream-calendar-editors.test.tsx`,
  `calendar/EventModal.test.tsx`
- `src/__tests__/store/dream-calendar-correctness.test.ts`,
  `event-modal-goal-sync.test.ts`, `goal-event-sync.test.ts`,
  `unlinked-event-fields.test.ts`
- `src/__tests__/dev-preview/preview-isolation.test.tsx`

Tools/configuration/documentation:

- `package.json` (local `scan:secrets` script only; no dependency/env changes)
- `playwright.config.ts` (existing local-only test guard retained)
- `scripts/scan-secrets.cjs`, `scripts/export-sync-recovery.js`,
  `scripts/verify-sync-export.cjs`
- `docs/production-sync-investigation.md` (pre-existing historical notes retained)
- `docs/SYNC_RECOVERY_RUNBOOK.md` (this report)

The two historical untracked QA files remain untracked and unchanged, outside
the authored file list above. Logs and starting snapshots remain ignored under
`.backups/sync-continuation-20261015-134702/`.
Follow-up evidence and before-change copies are retained separately under
`.backups/sync-reverification-20261015-141124/`.
