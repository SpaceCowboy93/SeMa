# Supabase V2 Preview preparation — 17 October 2026

Prepared locally; **no deployment exists for this candidate**. No commit, push,
deployment, remote configuration change, migration, database write, or original
browser access was performed. Existing application changes were preserved without
modification. This report and ignored local preparation artifacts were added.

## Candidate and review

Branch: `hotfix/production-sync`; base HEAD:
`d5217f2d7efc2fbb29b7a76e2437f8f86ab34db4`.
The candidate includes **21 modified tracked files and 43 untracked files**;
there were no staged changes. This report is additional to that starting inventory.
HEAD alone does not identify the candidate because its fixes are uncommitted.

A verified copy of all 271 tracked/nonignored source files, the binary working-tree
patch, starting status, and per-file SHA-256 manifest are in:
`.backups/v2-preview-2026-10-17/`.
Source manifest digest:
`eb01f86e5cbb592e455f191c6076173e99d8c5cad07d911836d796297ca75b91`.
`reviewed-changes.json` lists every starting changed/untracked file.

| Reviewed area | Included behavior |
| --- | --- |
| Sync hook and merge | Conditional household/version writes; bounded retries; record-level conflict isolation; linked Calendar/Dream/To-Do groups; queued refresh replay; persistence before send/acknowledgement |
| Cache and validation | Atomic IndexedDB bundles; strict durability; stale-tab detection; legacy preservation; storage warnings; malformed/duplicate snapshot rejection; date-keyed moods |
| Editors and store | Draft rebase and explicit conflicting choices; stable checklist identity/completion; explicit clears; linked field updates; pending text saved |
| New and modified tests | Recovery, interrupted acknowledgements, concurrency, storage capacity, original-cache export, account changes, V2 provenance and editor behavior |
| Package/configuration | `fake-indexeddb` plus lockfile; secret scanner script; loopback-only default Playwright setup with live mutation tests quarantined |
| Recovery tools and documents | Offline inspectors/exporters/verifiers and historical evidence; no automatic importer added; old live QA and its report preserved but not run or packaged |

## Verified V1/V2 boundary

The exact V2 backend is `https://wwxdinkdjkjiqzynfbdk.supabase.co`.
`shared-cache-scope.ts` selects
`semacalendar-v2:project:wwxdinkdjkjiqzynfbdk:<coupleId>:<stateId>` for this hostname.
Both compatibility/localStorage and durable/IndexedDB paths use it. V2 skips the
v1 fallback and ownership claim and excludes old roots from migration fingerprints.
Matching household IDs or the v1 owner marker cannot authorize importing old data.

The ten V2 regression cases use the actual durable adapter with a fresh fake
IndexedDB and mocked Supabase; network transports are prohibited. Five old formats
are rejected: ownerless v1, owned v1, scoped cache/base/pending, localStorage journal,
and IndexedDB checkpoint. Original bytes remain unchanged; no server mutation
occurs at startup, including an empty `{}` remote state. New V2 edits synchronize,
preserve existing/unknown server fields, and survive offline restart. An older tab
changing V1 keys cannot inject data into V2.

A separate fresh Chromium check against the staged store/cache modules repeated
all five format rejections with native IndexedDB, verified empty state/no pending
defaults, preserved original bytes, and restored only new V2 work after page reload.
HTTP interception and WebSocket interception allowed no external requests.

These results establish the automatic cache boundary under the exact V2 endpoint.
They do not authorize manual import/recovery, prove a hosted deployment, or cover
a custom hostname/another backend configuration. The production build still
contains legacy compatibility code for the old deployment; its V2 guards matter.

## Current backend and hosting inspection

Read-only V2 checks found:

- `sema-calendar-v2`, ACTIVE_HEALTHY, region `eu-west-1`.
- One `couple_state` row, ID `sema`, state exactly `{}`; two memberships in the same
  household and profile labels `mateo` and `seval` match that row.
- RLS enabled on all nine public tables; shared-state SELECT and UPDATE policies
  require membership. `couple_state` is in the Realtime publication.
- Public `event-photos` bucket exists, with zero objects. Push subscriptions and
  reminders are empty.
- Security advisor: three informational findings for RLS-enabled push tables with
  no policies, plus [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  No settings were changed. Review before wider use; missing push policies are
  consistent with leaving push disabled in this candidate.

Vercel MCP returned a scope-access 403. The read-only CLI fallback succeeded for
team `team_IaAKmshtFLyokMGFvqm2oeAP` and existing project
`prj_9q64HO9xSEjA0haET98sPHXR6AbG` (`sema-calendar`). Only that project was listed.
There is no dedicated V2 preview project yet. Preview has push/cron variables
shared with Production, so its existing environment is unsuitable as-is.

The workstation `.env.local` points to **V1** and contains privileged/push
credentials. `.env.preview` has empty Supabase settings and is not the normal
Next.js production-build environment file. Neither was changed or copied.

## Local preparation and validation

`source/` is an isolated source copy, not a Git worktree. It has no `.git` or
`.vercel` link. A local `node_modules` junction reuses installed dependencies and
is excluded from packaging. Its only actual environment file contains V2's public
URL and enabled publishable key, with these explicitly empty:
`SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `CRON_SECRET`, and `PUSH_SEND_SECRET`.
No original environment file or private token was imported into the build
environment or printed. Historical ZIP/text exports are preserved in the private
snapshot, excluded from the deployment package, and outside credential-scan scope.

The packaging-only `.vercelignore` excludes environment files, caches, dependencies,
Git/Vercel links, tests, recovery/live scripts, audits, migrations, exports and ZIPs.
These two generated overlays are hashed separately in `artifact-audit.json`.
All other source manifest files still match both the original and isolated copy.

| Check | Fresh result |
| --- | --- |
| Full `npm test` | 1,087 passed, 63 files, no skips; exit 0 |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with 20 existing warnings |
| `npm run scan:secrets` | Zero findings in 264 text files including this report; ignored env/backups and binary/history contents are outside its scope |
| `git diff --check` | Passed; existing CRLF notices only |
| Native storage browser script | Five scenarios passed: large bundle, strict durability, cross-tab CAS, abort after put, restore after closure; no external requests |
| Staged V2 native browser check | Five V1 formats rejected; original bytes unchanged; V2-only reload passed |
| Isolated optimized Next.js build | Passed on unchanged retry; first attempt hit a Google Fonts loader error. No font mocks or source/dependency changes used |
| Compiled artifact audit | 178 JS files checked; V2 endpoint in 2 browser and 12 server files; correct V2 publishable key; zero old backend refs or original `.env.local` credential values |

Local Next build ID: `8Wv4o4wWl9h-Gk04OOLFD`.
Evidence includes `vitest.log`, `build.log`, `build-retry.log`, `native-storage.log`,
`v2-browser.log`, `artifact-audit.json`, and `package-audit.json` in the preparation
directory. `v2-preview-source.tar.gz` is the verified deployment-source package;
its file list and SHA-256 are recorded alongside it. It contains no environment
file, Git/Vercel link, build cache, historical exports, or live QA scripts.
The local `.next` output is not a Vercel `--prebuilt` deployment artifact.

Photo uploads are deliberately unavailable in this minimal configuration:
`/api/upload-photo` requires a server credential and returns 503 after valid
authentication/input when it is absent. Push/admin routes are similarly unavailable;
no Vercel cron is configured. Local in-app reminders remain app behavior.

## Approval and verification still required

1. Approve a dedicated Vercel project, proposed name `sema-calendar-v2-preview`, in
   the verified team, without production domains or production integration secrets.
   Record its actual project ID; do not reuse the existing app's link/settings.
2. Approve configuring only its **Preview** environment with V2's URL and enabled
   publishable key. Keep all push/admin/cron settings absent. `.env.production.local`
   is for the local Next build; it is excluded from upload and is not remote config.
3. Approve freezing the exact candidate into a reviewable branch/commit and pushing
   it only through the dedicated project's GitHub-to-Vercel Preview pipeline, as
   required by `PROJECT_RULES.md`. No commit, push, project creation, or deployment
   command has been executed. Reconcile any later local edits against the manifest.
4. After deployment approval, perform a fresh Preview build, record URL/build/source
   identity and actual environment, and inspect browser AND server endpoints before
   any writes. Do not promote this V2-configured binary to production.
5. Separately authorize live V2-only tests with synthetic records and disposable
   browser contexts. Verify both profiles, concurrency, conflict choices, reconnect,
   reload, and one affected row per conditional save. Install browser/server egress
   guards that reject V1; the existing offline staging predicate does not install
   runtime guards. No hosted authenticated flow or live V2 write was tested here.
6. If photo testing is desired, separately approve a V2-only server credential and
   review the shared admin/push routes before enabling it. Never reuse V1's key.
   Production release, V1 recovery/import, migrations, and production settings need
   separate explicit authorization and their existing preservation/recovery plan.
