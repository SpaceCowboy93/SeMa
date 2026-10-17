# SeMa recovery and deployment plan — 15 October 2026

Status: **prepared locally; not ready to release**. Original-device exports,
verified server backup, isolated staging and recovery approval are still pending.
No production data/configuration changes, deployments, Git resets, commits,
pushes, browser changes or live QA scripts were performed for this plan.

## Preserved work and exact production comparison

Before adding these tools, all 41 existing modified/nonignored untracked files
were copied byte-for-byte to:
`.backups/recovery-plan-2026-10-15T14-40-58-884Z/files/`.
`manifest.json` records each file's SHA-256 and size; every copied file was
re-read and verified. `starting-diff.patch` preserves the tracked binary diff.
This is a local source snapshot, not a device or database backup. It is ignored
by Git; keep a private second copy off this machine before a release.

Branch remains `hotfix/production-sync`; HEAD is
`d5217f2d7efc2fbb29b7a76e2437f8f86ab34db4`. Existing files were not edited by
this preparation. The historical `scripts/qa-live-sync.mjs` and its report were
preserved and must not be executed for this plan.

Read-only Vercel checks reconfirmed the production alias and deployment:

- URL: `https://sema-calendar.vercel.app`.
- Project: `prj_9q64HO9xSEjA0haET98sPHXR6AbG`.
- Team: `team_IaAKmshtFLyokMGFvqm2oeAP`.
- READY production: `dpl_HdTPziGSkeZUUXF9kjyUVX7F3Tgw`.
- Deployment URL: `https://sema-calendar-flpwn8tt7-mateo-s-projects123.vercel.app`.
- Source: main, `d8282ebb59567d527d9b060e1008b8441b23901a`.

GitHub's exact compare of local HEAD to this production SHA returned one merge
commit ahead, zero behind and **zero changed files**. Thus the production and
local HEAD file trees match, despite different commit IDs. The existing 19
tracked working-tree modifications and 22 untracked files are the actual
preparation delta, not changes already included by that merge:

| Area | Production | Existing uncommitted Phase 1–3 behavior |
| --- | --- | --- |
| Merge / `sync-merge.ts`, sync hook | One conflicting event can hold the entire events collection and hide incoming Calendar changes | Record-level conflict isolation; linked Calendar/Dream/To-Do groups; independent records can proceed |
| Legacy/scoped cache startup | Separately saved state, baseline and pending metadata can disagree | Conservative legacy baseline handling; possibly unsent records remain reviewable |
| Durability / `couple-cache.ts`, `sync-checkpoint.ts` | Separate mirror writes without bundled recovery acknowledgement | Two-slot checksummed checkpoints, quarantine and storage-failure handling |
| Incoming sync | Busy read/save can drop a refresh signal; five-minute visible poll is fallback | Queued/coalesced refresh replay; polling retained |
| Recovery UI / app layout | New record conflict review and storage warnings absent | Per-record choices, version recheck, archives and persistent warnings |
| Calendar/Dream editors and store | Earlier linked-field/draft behavior | Draft rebase; linked fields/checklist identity and completion preserved |
| Validation | Earlier shared-data validation | Reject malformed/duplicate snapshots; handle mood identity correctly |
| Auth / server schema / access | Verified existing household and member policies | No changes to auth implementation, memberships, RLS, publication, dependencies or production environment required by this recovery |

Production's sync layout asset has SHA-256
`fbbbe4a7880780aa20a755725ed510f26a5ccd46c884188f64d81506b8c2e0d4`, path
`/_next/static/chunks/app/(app)/layout-5e538ed0968c7424.js`.
The exact original-device trigger remains unconfirmed: a matching code defect
does not prove what is in either original browser's memory/cache.

## What Mateo and Seval must do manually now

Do these steps separately on **each original browser/PWA storage context**.
A new browser, private window or preview URL does not contain the original cache.

1. **Disconnect the device first**: turn off Wi-Fi/mobile data (and wired
   networking, if applicable). Keep the existing SeMa tab/PWA open. Do not
   refresh, sign out, reinstall, clear storage, close drafts or open a new build.
   Stop editing. Foreground/online events can otherwise trigger an old save.
2. Photograph or copy every currently open unsaved event, note and checklist
   draft to a private offline file. Include dates, times, checklist item text
   and checked state. Keep original selected photo files separately: blob URLs
   and queued uploads are not image backups. Storage failures can also leave
   already displayed records only in memory, so photograph missing records too.
3. Open DevTools on the existing desktop tab (F12 / Inspect → Console), without
   navigating it. Read `scripts/inspect-original-device.js`, then paste its
   complete contents into that Console and run it. It refuses online or
   nonproduction contexts. Save the printed JSON as `mateo-inspection.json` or
   `seval-inspection.json`, labelled with the actual device/browser/PWA.
4. On that same offline original tab, read and run the complete contents of
   `scripts/export-sync-recovery.js`. Save the downloaded JSON; label the file
   Mateo or Seval without editing its contents. This separate export preserves
   exact raw cache, baseline, pending, checkpoint, quarantine and recovery bytes.
   The inspection report alone cannot recover any records.
5. Transfer the download privately to this workstation and make a second private
   copy on separate/offline storage. Run the command below for **each copy**.
   Require `valid: true`, matching SHA-256 and matching entry count. Also verify
   the inspection counts and that representative known missing records and
   checklist completion are present in the private export. A checksum verifies
   integrity, not that every expected record or memory-only draft was captured.
6. Leave both originals offline and open. Retain all drafts, raw exports and
   reports. Do not reconnect until the per-device guarded recovery is approved.

```powershell
node scripts/verify-sync-export.cjs 'C:/private-backups/mateo-device.json'
node scripts/verify-sync-export.cjs 'C:/private-backups/seval-device.json'
```

For an original Android Chrome browser, attach the phone by USB and select that
existing tab through desktop Chrome's `chrome://inspect`. For an iPhone/iPad,
use a trusted Mac's Safari Develop/Web Inspector and select the exact existing
Safari tab or inspectable PWA. Keep the phone offline; do not enable tethering or
navigate the original. If that browser/PWA cannot be attached while preserving
its tab, stop: keep it offline/open and arrange a device/profile backup and
appropriate inspection access. A replacement fresh session is not an export.

If inspection/export fails, returns no app cache, or expected work is missing,
keep the original intact. Obtain a device/profile backup and preserve displayed
records/drafts; do not fix the failure by clearing storage. Never paste tokens,
passwords, full HAR files or private export contents into public reports/Git.
The inspector reads no auth keys or input values and makes no requests. It does
not verify in-memory Zustand state, active auth identity, live subscriptions or
actual available localStorage quota. It reports both checkpoint slots without
repairing/selecting one. Online=false is an additional guard; physically verify
the network is disconnected.

## Server backup and record reconciliation — before deployment

These tasks can be done by the operator once the private device exports exist.
They are still pending; no real-device/server data backup has been claimed.

1. Manually verify Supabase SQL editor is in **sema-calendar**, project
   `neyhoodxeumpbxekskej`. With originals offline, run the prepared
   `scripts/export-server-snapshot.sql` and download its **one result as JSON**.
   This is a READ ONLY transaction exporting the full `state` JSONB text,
   `updated_at`, state/household IDs, capture time and server-computed MD5.
   The project-ref field is a label, not proof of which SQL editor was used.
2. Run `node scripts/verify-server-snapshot.cjs 'C:/private-backups/server.json'`.
   Require `valid: true`; retain the file SHA-256, state SHA-256, row version,
   capture time and counts. Verify a second private copy has the same hashes.
   Repeat the capture immediately before the authorized recovery window; old
   investigation hashes are not a current backup. Download JSON, not a screenshot
   or truncated cell/CSV copy. Zero rows or multiple rows is a stop condition.
3. Compare the two private cache exports and drafts against the fresh server
   snapshot offline. For every missing/conflicting record, make a private manifest
   of record IDs, source device, baseline trust, local/server before-values,
   intended after-values and explicit owner choice. Include whole linked
   Event/Dream/To-Do groups, note text and checklist IDs/text/checked state.
   Local-only may mean unique work or a stale copy of a server deletion; do not
   infer an upload or deletion from presence/absence alone. Retain unknown server
   fields. Compute comparable hashes over identical serialization/field sets;
   inspector canonical hashes and raw PostgreSQL hashes are not interchangeable.
4. Confirm hosted deployment retention and existing managed DB backup/PITR
   coverage in their dashboards; record the available retention and restore
   procedure. Their availability was not verified by this preparation. This
   shared-row export is not an Auth, Storage-object or whole-project backup.
   This release requires no auth/schema/media changes, and must not delete media.
5. Keep raw originals immutable; perform restore/recovery rehearsals only on
   copies. Obtain explicit approval of the per-record manifest and rollback plan
   before any production data recovery. This document is not that approval.

## Staging availability: current result

**No isolated staging was found in the connected resources.** Supabase lists
only the production project and **no development branches**. Vercel has an
existing READY preview, `dpl_8ngeYBukjMuGKUDF89Y3jgKrGVaw`, at
`https://sema-calendar-imf1clxxw-mateo-s-projects123.vercel.app`, source `d5217f2`.
Read-only inspection of its public JavaScript found the production Supabase
project ref `neyhoodxeumpbxekskej`. This preview is **not safe for write tests**.
No named custom staging environment was returned by the project metadata.
Preview and production environment variable names were inspected; no credential
values were printed. Existing preview push-related configuration is another
reason to disable external side effects in the future staging environment.

Before staging tests, authorize/provision a separate Supabase project/branch or
an isolated local Supabase stack, plus a separate Vercel staging project/preview
configuration that binds only to it. Provision two disposable test accounts with
the app's `mateo`/`seval` profile labels, both in one new staging household and
state ID `sema`. Do not copy production passwords, sessions, keys or push
subscriptions. Use a reviewed schema preparation: the existing household-binding
migration contains production identity assumptions and is not a staging seed
script. Do not replay the migration directory blindly. Disable push delivery,
cron, notifications and other external integrations in staging.

Before allowing even a test write, verify compiled browser endpoint AND server
client environment both point to the isolated database, including media routes.
Use a network allowlist/deny rule to prevent staging requests to the production
Supabase hostname. Record the distinct project refs, hostname, release SHA and
two test identities. A preview hostname alone is not sufficient isolation.
Never navigate an original device to staging; use disposable profiles/devices.

## Release and verification sequence — future authorization required

1. Freeze the reviewed recovery source into a release commit/PR only after the
   user authorizes it. Include the existing Phase 1–3 safeguards together; do not
   bypass conflicts or turn this into a raw stale-cache upload. Rebase/merge
   against the verified current main in a separately preserved checkout later;
   no fetch, branch reset or mutation of the present Git checkout was done here.
2. Run current offline quality gates on that exact candidate: complete Vitest,
   TypeScript, lint, production build, diff checks and secret scan. Tests must
   keep Supabase mocked; do not run the historical live QA scripts. The previous
   application gate evidence records 997 tests / 55 files, typecheck, lint,
   build and scan passing; it is historical evidence, not a new candidate gate.
3. After staging is isolated and separately authorized, build/deploy the candidate
   there. Rehearse the two original cache *shapes* using deidentified copies and
   new staging scopes in disposable browsers. Verify ambiguous local-only work
   remains held, remote additions arrive, independent same-collection work saves,
   reviewed versions archive and restart resumes safely. Rehearse rollback on
   these copies. Never restore raw keys into an online original browser.
4. Complete the two-device staging matrix below. Record exact build SHA, fixture
   IDs, before/after snapshots, affected-row counts, subscriptions and timings.
   Any loss, duplicate identity, unrelated change or partial linked write stops
   release. A green UI or HTTP 200 without one affected row is insufficient.
5. Refresh all backup/record-choice evidence and receive explicit deployment and
   narrowly scoped recovery approval. Keep originals offline. Prepare a
   production-target deployment without assigning the production alias, after
   authorization. The staging artifact embeds a different database endpoint:
   **do not promote that staging binary directly into production**. Build the
   same reviewed source SHA with production configuration and verify its compiled
   endpoint, credentials separation and asset fingerprints. Inspect this build
   using a fresh browser with app mutations blocked before its first navigation.
6. Assign/promote only the reviewed production-target deployment after its
   read-only checks pass. Reconfirm the alias and source SHA. Deployment alone
   does not reconcile original-device caches; keep them offline until guarded.
7. Before reconnecting either original, establish and verify a method-aware
   mutation blocker in that **existing** browser context while offline. It must
   block shared-data POST/PATCH/PUT/DELETE and application mutations, permit only
   required reads/auth, and not record credentials. Blocking only Realtime,
   pausing UI or guarding Vercel routes does not block direct Supabase writes.
   Do not restart a browser to enable debugging and lose unpreserved memory.
   If reliable interception on either original is unavailable, leave it offline
   and stop for a separately reviewed recovery method. Do not improvise a global
   fetch patch or weaken RLS. No interception mechanism was installed here.
8. Under that block, load/verify the new production bundle on the first original
   only after its drafts/raw exports are secured. Compare recovered checkpoints
   and records against those exports; check storage warnings. Checkpoints and
   archives consume additional space; successful inspection cannot certify they
   will fit. If they fail, keep the tab open and writes blocked. Then narrowly
   allow only manifest-approved record changes against a fresh server version,
   preserving unrelated fields and requiring one affected row. Retain the before
   snapshot and returned version. Repeat with the other original; do not enable
   general writing until both devices are reconciled and accepted.
9. Production acceptance uses the genuine, approved recovered events/notes/
   checklists and read-only observation on the partner. Do not create live QA
   records or run old live QA drivers. Check exact IDs, text/checked state and
   links, database persistence, partner display, and then persistence after a
   guarded reload once drafts/checkpoints are safe. Prove both directions only
   when each has an approved genuine change; otherwise report that direction
   unverified. Verify poll/realtime health without creating traffic artificially.

## Two-device staging acceptance matrix

All rows below are **pending**, and require an isolated backend. Perform through
the normal UI using only disposable synthetic records; no live QA script.

| Test | Required evidence |
| --- | --- |
| Mateo creates event/note/checklist; Seval receives | One conditional row update; matching IDs/values/checked state on server and partner; subscribed Postgres Changes; measured delay |
| Seval creates/edits; Mateo receives | Same evidence in reverse; do not infer from the first direction |
| Complete/uncomplete checklist; edit linked Dream/Event/To-Do | Matching checklist identity/completion and every linked record; no half-written group |
| One conflicted record plus unrelated addition in same collection | Both conflict versions retained; unrelated addition synchronized; independent remote addition visible |
| Legacy pending/base absent or inconsistent, including empty pending marker | No silent overwrite or resurrection; ambiguous records require review |
| Concurrent edits; write loses timestamp race | Fresh re-read/rebase; zero-row result not acknowledged; both versions retained |
| Realtime arrives during read/save; socket unavailable | Queued refresh replay; visible five-minute polling fallback; hidden tab/foreground behavior verified |
| Offline edit/reconnect and controlled reload | Pending data retained; no duplicate records; exact server/partner values after restart |
| Quota failure/interrupted checkpoint; duplicate/corrupt fixture | Warning and safe hold; raw bytes retained; no false save acknowledgement |
| Auth switch/expiry and unapproved household | No cross-account data exposure or wrong-household writes |
| Rollback rehearsal using copies | Before/after values and unrelated partner work preserved; old client never opened against a recovered original cache |

Use an agreed active-session propagation budget (for example 15 seconds on a
stable connection) and record actual times. The fallback is five minutes plus
request/render time. Hidden/background suspension is not evidence of lost data.

## Rollback and stop conditions

Before any approved recovery write, retain exact server before-state, affected
record/linked-group IDs, intended after-values and returned `updated_at`.
If anything unexpected occurs, block writes/keep originals offline, export new
device recovery histories and capture a fresh server snapshot first.

The retained production deployment `dpl_HdTPziGSkeZUUXF9kjyUVX7F3Tgw` is the
application rollback reference. Reconfirm it is available before release. Alias
rollback affects code only; it does not undo database writes, local checkpoints
or editor drafts. That old code has the conflict defect and does not understand
all new recovery metadata: keep recovered originals isolated from it. Prefer a
reviewed forward correction when possible. A code rollback must not silently
reopen general editing or auto-downgrade a recovered cache. Reconfirm alias,
build and future auto-assignment state after any authorized rollback.

For an authorized data undo, pause writers and re-read current server state.
Apply an inverse change only to manifest-listed records **whose current values
still match the approved after-values**, using the latest `updated_at` condition
and verifying one affected row. Preserve later partner changes and unrelated/
unknown fields. A changed record requires another explicit review. Do not
restore the entire old JSON over newer state. Local recovery uses reviewed
records from archives/exports; no blind key import, storage clearing or cache
downgrade. Whole-database/PITR restoration is a separate incident procedure, not
the routine rollback for this client-only release.

## Prepared-tool verification and remaining gates

This preparation adds an offline inspector, a read-only server-export SQL file,
a server-export verifier, their tests and this plan. The existing browser export
and verifier remain unchanged. Synthetic tests assert no auth reads, network,
storage writes, downloads by the inspector, or private-content output; reject
online/wrong-origin/unstable reads; separate checkpoint slots; and reject bad
server digests, wrong bindings, malformed or multiple-row exports.

The focused command is:

```powershell
node node_modules/vitest/vitest.mjs run src/__tests__/lib/recovery-preparation-tools.test.ts src/__tests__/lib/device-cache-export.test.ts --maxWorkers=2 --minWorkers=2
```

Result: **18 tests passed, 2 files**, synthetic data only. TypeScript passed with
`--noEmit --incremental false`; JavaScript syntax checks and `git diff --check`
passed. The source secret scan covered 247 text files with zero findings; ignored
private backups/environment files were excluded. All 41 original files still
matched their starting hashes after preparation. No live QA was run.
Actual original-device exports, second-copy verification, current server export,
private record-choice manifest, isolated staging, two-device acceptance and a
guarded original-browser recovery method are all still required. Preparing
scripts and verifying synthetic exports does not mark those gates complete.
