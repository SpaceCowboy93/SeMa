# SeMa Phase 1–3 recovery audit and isolated staging plan

Follow-up: [IndexedDB recovery audit](INDEXEDDB_RECOVERY_AUDIT.md) implements and
measures a local alternative to the capacity bottleneck identified below.
This earlier audit remains the historical evidence and staging plan; release
prerequisites and original-device preservation requirements still apply.

15 October 2026. **Local audit complete for the checked paths; release blocked.**
No production data/configuration changes, Supabase provisioning, deployment,
push/reset, live QA writes or original-device cache access were performed.
Existing application/recovery files and earlier plans were left unchanged.

## Preservation

All **46** pre-existing changed/nonignored untracked files matched the preceding
investigation's SHA-256 manifest digest:
`240f07e3fd853153b7a92044e0c3c14d072fc35f7f771ac3e73cefa45ae2a416`.
Before additions, each was copied and re-read/hash-verified under
`.backups/staging-audit-2026-10-15T16-44-53-672Z/files/`.
That new directory contains `manifest.json` and `starting-diff.patch`. Earlier
backups were not overwritten, moved, pruned or restored. HEAD remains `d5217f2`.
This is a source backup, not an original-device or database backup.

## Recovery completeness

| Protection | Audit evidence | Remaining limitation |
| --- | --- | --- |
| Record-level conflict isolation | `sync-merge.ts` freezes only reviewed records and their linked group; actual Calendar-hook tests now save unrelated events while preserving both conflict versions across restart | Ambiguous local-only records still need a human choice |
| Concurrent Calendar creation | Actual sync hook loses a simulated conditional write, rereads the simulated partner event and retries with the new version, in both author directions | Mocked gateway, not two live browser processes |
| Checklist/Dream/Event coherence | Stable checklist IDs, checked state, text projection and linked updates are tested through the hook/store/editor suites | Already corrupt server links and legacy identity ambiguity are not automatically repaired |
| Missing/inconsistent baselines | Legacy v1, scoped cache without base, and falsely clean mismatched base retain events, notes and checklist completion; server-only additions import without silently uploading ambiguous work | Actual original-device exports remain unavailable |
| Interruption and lost response | Six acknowledgement-checkpoint interruptions recover one persisted event without a duplicate write; a lost response is reconciled from the server | First-ever persistence failure can leave new work only in memory |
| Checkpoint safety | Checksums, staged envelope/pointer, conservative pending markers, quarantine, unsupported versions, recovery archives and rejected duplicate identities are covered | Storage capacity is a release blocker below; localStorage is not atomic across tabs |
| Busy refresh and access isolation | Existing suites cover queued Realtime refresh, polling, auth invalidation and household scoping | Original-device subscriptions and browser behavior still unverified |
| Server preservation | Writes rebuild from a fresh server read, preserve unknown JSON fields and condition on state ID, household and exact `updated_at` | Real-row validation needs actual device/server comparison |

No application implementation was changed by this audit. Passing offline tests
does not imply the release gates or original-device recovery are complete.

## Important finding: checkpoint size

The previously observed shared/cache snapshot is approximately 1.7 million
characters. Each checkpoint holds **both state and baseline**; two slots retain
four snapshot copies, alongside the legacy state/base mirrors (two more), before
archives, pending metadata and quarantines. The same origin may also retain v1.

`recovery-capacity-audit.test.ts` builds a **synthetic** 1.72M-character event
payload. Actual checkpoint serialization plus mirrors exceeds **10 million
characters** after two writes. Even a generous simulated 5 MiB budget counting
one unit per ASCII character rejects the first checkpoint while keeping all
existing mirror bytes intact. Real browser accounting can be more restrictive.
The test proves safe refusal under that budget, not the original devices' quota.
MDN documents the localStorage limit and `QuotaExceededError` behavior:
[Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria#web_storage).

**Stop release until this is resolved or realistic browser-copy tests demonstrate
adequate headroom on both target storage implementations.** The new code blocks
sending/acknowledgement if persistence fails, so it may preserve data yet leave
synchronization permanently paused at the household's actual size. A fully
failed first write leaves an edit only in the open tab and closure can lose it.

Recommended next local implementation work: a bounded recovery journal in
IndexedDB or another reviewed durable store, with transactional state/baseline/
pending/history acknowledgement and interruption tests. Do not delete legacy
caches/history to make room or remove the checkpoint safety gate. Preserve raw
device exports first; rehearse any storage migration on copies, not originals.
Moving the journal alone is not a complete design: measure the remaining mirror
footprint, archive growth, quota failure and unsupported-version handling too.

## Staging availability and isolation verdict

Fresh read-only discovery returned only production project
`neyhoodxeumpbxekskej` and **zero development branches**. The existing preview
`sema-calendar-imf1clxxw-mateo-s-projects123.vercel.app` still embeds that
production project in its public JavaScript. No app JavaScript was executed.
It is **not isolated and must not be used for write tests**.

The older production deployment embeds `ziyuqxoygtgzcjlsqfwc`; access to that
backend was denied in the preceding investigation. Both known backends must be
excluded from staging. Actual backend cutover reconciliation remains pending.

**Runtime isolation cannot be certified: no isolated staging exists.** The new
`scripts/check-staging-isolation.cjs` is an OFFLINE configuration checker and URL
allowlist predicate. It is not installed in the app, browser or server. It rejects
both production refs, known unsafe app origins, mixed backend/storage/server
origins, production project IDs and unexpected credential fields. Its CLI always
reports `runtimeIsolationVerified: false` and `readyForLiveTesting: false`.
It reads only an explicitly supplied nonsecret manifest, not .env/auth storage,
and never makes requests. Sixteen offline tests verify these rules. A declaration
such as `serverCredentialProjectRef` is not proof of actual credential provenance.

## Plan to configure isolated Supabase staging — not executed

1. After separate provisioning authorization, prefer a **new standalone Supabase
   project** with a distinct ref and a separate staging app project. This avoids
   accidental production branch merges/management automation. A persistent
   Supabase branch is an alternative only after reviewing its automation and
   inherited configuration. Supabase describes branches as separate instances
   with separate credentials and no production row data by default:
   [Branching](https://supabase.com/docs/guides/deployment/branching).
2. Create a reviewed schema-only bootstrap with the existing tables, membership
   helper, grants, RLS and Realtime publication. Do not dump production rows,
   Auth sessions, Storage objects, Vault secrets or push subscriptions. Do not
   replay the current migration directory: its household-binding migration
   assumes pre-existing production IDs and is not a fresh staging seed script.
   No schema bootstrap SQL has been executed or certified by this audit.
3. Seed only invented records and two disposable Auth accounts, labelled `mateo`
   and `seval` in profiles, in one newly generated staging household UUID. The
   app requires state ID `sema`; it does not require the production household
   UUID. Add a synthetic outsider for negative RLS tests. Disable outbound mail,
   push, cron, webhooks and third-party integrations before any browser use.
4. Provision only staging URL, public key and server credentials to the separate
   staging app. Leave production variables untouched. Never pull/copy production
   `.env.local`, `.vercel` context, browser tokens or keys into the staging copy.
   Public build variables and server/media client configuration must all point
   to the same new ref. Public fields contain no service/admin credentials.
5. Prepare synthetic fixtures with the **shape and size** of the originals, not
   their personal contents. Include unknown JSON fields, legacy markers, linked
   checklists, photo-sized strings and malformed/interrupted checkpoints. Use
   disposable browser profiles; never navigate an original browser to staging.
6. Before allowing any request, install independent browser and server egress
   enforcement. Allow only the exact staging app and backend, including its
   Realtime WebSocket. Deny every other destination, including both production
   refs, direct REST/Auth/Storage requests, public photos and production app API
   routes. Revalidate every redirect. A frontend guard, different credentials,
   RLS or the absence of production secrets alone cannot prevent fetching public
   production media. If the host cannot enforce server egress, use a controlled
   isolated test environment with an enforcing gateway; do not certify isolation.
7. Verify deployed project identity, actual compiled backend, actual server and
   media client environment, and credential provenance independently. Supply the
   resulting **nonsecret declarations** to the preflight checker below. Inspect
   the artifact/config, not just environment-variable names or a preview URL.
8. Under those network guards, attempt sentinel destinations for both production
   refs and verify rejection **before forwarding/DNS/network**, with zero
   forwarded production requests. Exercise the same guard from browser and server
   paths, including redirects and Storage. Do not send a real production read or
   write to prove rejection. Record guard configuration, synthetic denial logs,
   staging identities and artifact hash. Check RLS with staging accounts only.
9. Only after isolation is evidenced, authorize synthetic two-device staging
   writes through the normal UI. Test both directions, concurrent creations,
   same-record conflicts plus independent additions, completion toggles, missing
   bases, restart, interrupted acknowledgement and realistic quota failure.
   Require one affected shared row, matching IDs/links/checked states, measured
   Realtime delivery and polling fallback. Retain before/after fixtures. Do not
   run historical live QA scripts, merge branches or promote a staging bundle.

Example manifest shape; placeholders deliberately FAIL preflight:

```json
{
  "format": "sema-staging-config",
  "version": 1,
  "environment": "staging",
  "projectRef": "REPLACE_WITH_NEW_STAGING_REF",
  "browserBackendUrl": "https://REPLACE_WITH_NEW_STAGING_REF.supabase.co",
  "serverBackendUrl": "https://REPLACE_WITH_NEW_STAGING_REF.supabase.co",
  "storageBackendUrl": "https://REPLACE_WITH_NEW_STAGING_REF.supabase.co",
  "serverCredentialProjectRef": "REPLACE_WITH_NEW_STAGING_REF",
  "appUrl": "https://REPLACE_WITH_NEW_STAGING_HOST",
  "vercelProjectId": "REPLACE_WITH_NEW_STAGING_PROJECT_ID",
  "syntheticDataOnly": true,
  "externalEffectsDisabled": true
}
```

```powershell
node scripts/check-staging-isolation.cjs 'C:/private-config/staging-manifest.json'
```

A successful exit validates declarations only; the independent runtime steps
remain mandatory. This checker deliberately supports the planned hosted HTTPS
staging configuration, not an arbitrary localhost backend or unknown proxy.

## Other remaining data-loss risks

- Cache/checkpoint scope includes household and state ID, **not backend ref**.
  Verify provenance before a backend cutover; identical IDs do not prove a
  common history. Do not import original raw caches into staging unchanged.
- Legacy local-only records may be unsent work or copies of a deletion; explicit
  record review and private before/after manifests are still required.
- Multiple tabs can race on localStorage. Use one original tab per storage
  context during recovery; best-effort token checks are not a cross-tab lock.
- Browser/OS eviction, complete persistence failure, open editor drafts and
  queued photo files are outside cache-export/checkpoint durability guarantees.
- Archives/quarantines grow; older clients cannot safely interpret all recovery
  metadata. A code rollback does not undo data writes or downgrade caches safely.
- Existing invalid links/duplicate identities need review; the client does not
  silently repair corrupt historical data. Legacy checklist identity/order can
  require manual comparison rather than assuming an index proves identity.
- Concurrent increments of a snapshot counter cannot represent every increment;
  this is not an operation-log/counter redesign.
- Full snapshots still cost bandwidth and leave a bounded retry limit under
  contention. Actual auth/Realtime/network/browser behavior needs isolated QA.

## Verification and next action

The new tests use mocked Supabase, synthetic jsdom storage or explicit in-memory
checkpoint IO. Calendar tests throw if fetch/WebSocket/XHR is used. They neither
attach to original browsers nor read real exports. The capacity model is an
explicit chosen budget, not a measurement/probe of an original browser.

Final complete suite: **1,046 passed in 59 files**, no skipped tests. The new
focused audit has **34 passing tests in 3 files**, including the extra
same-collection Calendar case and two capacity checks. The complete-suite log is
in this audit's new backup directory, `full-tests-final.log`. TypeScript
(`--noEmit --incremental false`), focused lint, JavaScript syntax and
`git diff --check` passed. The secret scan checked 252 text files with zero
findings; ignored backups/environment files were excluded. All 46 original
working files AND their new snapshot copies still match the starting hashes.
Existing React ref/act warnings remain in otherwise passing UI tests. No fresh
production build or hosted test is claimed by this preparation.

**Next safest action:** resolve the recovery journal's realistic capacity locally
without deleting original work, then provision the separate staging environment
under explicit scope and prove its runtime egress isolation. Original-device
raw exports, drafts, a current verified server export and per-record approval
remain prerequisites to loading recovery code on either original. Use the
existing inspection/export procedures; they were not run on devices here.
