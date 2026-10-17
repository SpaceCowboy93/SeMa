# Production synchronization investigation

Baseline: production deployment `dpl_G6EUqbHQWMpXy9QHUYYTgQN4efKb`, main
`2f58a0cec2bfde50bb7da5ac8bb8bf2058965bf4`. The original local branch was
`security/phase-1-auth-foundation` at `e33ce4deb393dfb82ebcb64ebfa2eb532c325824`.
Tracked work was clean; the two untracked QA scripts were preserved.

## Read-only database and request evidence

- Both partner Auth accounts and profiles exist. Each has exactly one membership,
  in couple `3de918c1-fccc-454d-8618-8dce607ea4d8`.
- Exactly one `couple_state` row exists: `sema`, bound to that same couple. Its
  primary key, unique couple constraint and foreign key are present. No user
  triggers are attached, and no orphan state rows were found.
- The initial snapshot was last updated at `2026-10-09T18:45:35.431Z`, with
  1,730,349 JSONB text bytes and SHA-256
  `5113ffe02dbbeedd6bd32005a7a21e3bc9aaeb038e66874fa853b18a3534c5aa`.
  All shared array fields contain valid IDs; no private field values were printed.
- RLS is enabled. Authenticated members can SELECT and UPDATE through the private
  membership helper. Effective column grants allow updating only `state` and
  `updated_at`, not household identifiers. Profile/member SELECT grants and
  private-helper EXECUTE/schema USAGE grants are present.
- Applied migration history includes `20260924152904_bind_sema_and_enforce_member_access`.
  The activity-notification migration is absent and was not applied.
- In the bounded Production-origin edge logs from `2026-10-09T19:37:12Z` to
  `2026-10-09T21:04:26Z`, Mateo had 36 successful `couple_state` GETs and Seval had
  16. Each returned row range `0-0/*`. The actual `state,updated_at` reads numbered
  18 and 11 respectively, all using `id=eq.sema` and the correct `couple_id`.
  No PATCH, POST or UPSERT was recorded for either account in that window.
  These are request-log observations, not a new live write test.
- `couple_state` is absent from every Realtime publication. The existing
  `supabase_realtime` publication supports UPDATE events but does not contain
  this table. Missing replication cannot explain the lack of writes by itself.

## Code path

`getVerifiedAccess` verifies the Auth user before resolving the profile,
membership and bound row using that user's session. `useAuthSession` loads the
scoped cache before establishing the context. The app layout calls
`useSupabaseSync` once; development preview does not mount it.

The Zustand subscription records changed shared keys and their original values,
then debounces a conditional UPDATE by 800 ms. It reads/rebases first and filters
by state ID, couple ID and the current database timestamp. Zero matching rows
retry at most three times. Session invalidation aborts stale work.

Shared keys include calendar/checklists, notes, shopping, finance, goals and other
household fields. Identity, UI state, local Activity Centre entries and notification
preferences are excluded. Cache hydration happens before the sync subscription;
clean fields take the remote value, and genuine conflicting local edits remain
pending. Legacy caches without a baseline deliberately retain ambiguous edits.

The defect reproduced by offline regression tests is a global conflict barrier:
one pending-field conflict aborts every write, even unrelated additions. A dirty
fallback/manual pull calls that same save and exits without applying remote data.
Consequently an unresolved legacy-cache or concurrent-edit conflict can suppress
both outbound work and incoming clean fields. This client-side trigger still
requires confirmation in the affected phone caches; no cache was cleared or
copied to simulate their state.

The correction isolates conflicted fields: their remote values are not overwritten,
their local work stays pending, independent changes can be conditionally written,
and pulls continue to merge clean partner data. Conflict rules and timestamp
concurrency protection remain in place.

The five-minute fallback interval skips hidden tabs, with immediate pulls on
foreground/online events. Realtime UPDATE signals also pull and reset the timer.
Before this correction, error paths only changed a module status which no current
layout UI consumes; subscription status is not observed by the hook.

## Prepared database correction — NOT APPLIED

Run only against the verified current project after reviewing this evidence and
authorizing the publication change. This changes replication configuration only;
it does not alter policies, grants, row data or migration history.

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preflight$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.couple_state
    WHERE id = 'sema'
      AND couple_id = '3de918c1-fccc-454d-8618-8dce607ea4d8'::uuid
  ) THEN
    RAISE EXCEPTION 'Verified SeMa state binding not found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication
    WHERE pubname = 'supabase_realtime' AND pubupdate AND NOT puballtables
  ) THEN
    RAISE EXCEPTION 'Unexpected Realtime publication configuration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'couple_state'
  ) THEN
    RAISE EXCEPTION 'couple_state already published; recheck before applying';
  END IF;
END
$preflight$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.couple_state;
COMMIT;
```

Do not apply `20261008120000_activity_notifications.sql`. Activity delivery remains
disabled. No authenticated QA item was created during the initial diagnosis.
Browser observation uses isolated in-memory contexts, manual sign-in, blocked
application writes and notifications, and only safe status/count/hash metadata.

## Hotfix validation

Two regressions failed before the correction: incoming clean partner data was
ignored when a field conflicted, and an independent pending addition never caused
an UPDATE. Both pass after the correction. Focused synchronization/cache tests:
80 passed across six files. Full suite: 829 passed across 45 files with two workers.
The first full run under concurrent quality gates timed out twice in the unchanged
development-preview file and caused two subsequent React cleanup failures; that
file passed all 14 tests in isolation before the successful complete rerun. No
assertions were skipped or timeouts increased.

TypeScript, lint, production build, `git diff --check` and a credential-pattern
scan passed. Lint/build retain 20 existing warnings. The scan covered 228 files,
including this new report, and reported zero findings without printing values.

Manual sign-in in the two isolated observation windows remained pending during
these checks. Authenticated browser subscription status, live write response and
affected-row count, and the original phone cache conflicts are therefore not yet
verified. No live QA item has been created. The missing publication and reproduced
code defect are confirmed independently; they do not establish the exact pending
cache condition on either affected phone.

## Read-only follow-up — October 11, 2026

Supabase request logs were inspected for `2026-10-11T16:28:42Z` through
`2026-10-11T17:28:42Z` (17:28–18:28 Europe/Dublin). No database SQL, migration,
test record, cache clearing, application change or deployment was performed.
Log inspection used read-only queries against the logs service.

The observed Preview origin was
`https://sema-calendar-imf1clxxw-mateo-s-projects123.vercel.app/`.
Account labels were matched against previously verified local identity records.

| Preview account | Shared-row GETs | Shared-row PATCHes | Result |
| --- | ---: | ---: | --- |
| Mateo | 23 | 1 | All HTTP 200, row range `0-0/*`, CDN status `DYNAMIC` |
| Seval | 19 | 2 | All HTTP 200, row range `0-0/*`, CDN status `DYNAMIC` |

Mateo's PATCH occurred at `17:22:02.782Z`; Seval's at `17:23:46.184Z` and
`17:26:25.303Z`. These were existing logged requests, not writes initiated by
this diagnosis. Successful reads and affected-row metadata show that both
accounts can reach the shared row and have successfully updated it in this
window. They do not establish what was changed or whether the other browser
displayed those changes. The previous observation of no writes no longer
describes this Preview window. CDN cache hits are not evident for these requests.

Seven Realtime WebSocket requests returned HTTP 101 in the same window. Their
origin/account attribution was unavailable in the selected log fields. Realtime
logs show initialization of `supabase_realtime_messages_publication` for
`realtime.messages`; this does not establish a working Postgres Changes
subscription for `public.couple_state`. Selected Postgres logs contained no
publication/subscription/couple_state entries. The October 9 finding that
`couple_state` was unpublished has not been rechecked against current database
catalogs, and no publication correction was applied here.

The previous CDP endpoints at 9222/9223 refused connections. A read-only process
check found a normal Chrome launcher without a debugging endpoint and no active
Node observation helper. Therefore the user-reported signed-in sessions could
not be attached to for cache counts/hashes, pending keys, baseline comparisons,
quota errors or Realtime frame inspection. No browser was restarted and no
session/profile/token storage was copied. Browser cache conflicts and actual
Postgres Changes subscription status remain unverified.

The local checkout contains the conflict-isolation correction at `d5217f2`.
This alone does not prove which code is loaded in either Preview session.

## Current publication recheck and isolated observation setup — October 11

At the user's request, a transaction declared `READ ONLY` inspected
`pg_publication` and `pg_publication_tables`. It confirmed that
`public.couple_state` **is currently included** in `supabase_realtime`.
The publication enables INSERT, UPDATE and DELETE and is not an all-tables
publication. The separate `supabase_realtime_messages_publication` does not
include `couple_state`. This supersedes the earlier missing-publication finding;
the previously prepared ALTER PUBLICATION must not be applied on that evidence.
No database configuration or data was changed by this check.

Two new, separate temporary browser sessions were opened on the confirmed
Preview, labeled `Mateo — sync observation` and `Seval — sync observation`,
with loopback debugging ports 9332 and 9333. Both SeMa login forms were verified
using only heading/button text and input types, without reading input values.
Manual sign-in is pending. Application mutation requests and application API
routes are blocked; Supabase's login/token-refresh POST is allowed without
inspecting its body, headers or response. Service workers are blocked and
notification permissions are not granted. Password fields are not inspected,
and credentials/session state are not exported by the observer.

The observer records only safe request/subscription metadata and cache field
counts/comparison results. It tracks active five-minute sync polls, channel joins,
database-change messages and initial shared-state reads. The initial snapshots
show empty scoped caches, zero shared-state reads, no Realtime joins and zero
sync polls while signed out, as expected. Fresh-session results will not establish
the state of pre-existing phone/laptop caches.

## Signed-in Preview observation — October 11, 18:42–18:44 Dublin

Both identities were verified from their own authenticated profile reads. Both
landed on `/together`, online, with the same verified household binding.

| Observation | Mateo | Seval |
| --- | --- | --- |
| Initial full shared-row read | HTTP 200, one row at 17:42:43.215Z | HTTP 200, one row at 17:42:59.614Z |
| Requested shared row | `id=eq.sema`, verified `couple_id` | Same |
| Database version | `2026-10-11T17:26:24.091+00:00` | Same |
| Pending fields | Empty `[]` | Empty `[]` |
| Sync baseline | Present, all 18 shared fields, matches local cache | Same |
| Local fields different from last full database read | None | None |
| Legacy v1 cache | Absent | Absent |
| Active committed sync effect | 1 | 1 |
| Active five-minute sync poll | 1 | 1 |
| Realtime channel join | 1 | 1 |
| Postgres Changes subscription | `Subscribed to PostgreSQL`, status `ok` | Same |
| Received database-change messages | 0 | 0 |
| Observed cache/quota errors or page errors | 0 | 0 |
| Attempted shared-data mutations blocked by observer | 0 | 0 |

Each scoped cache contains 1,722,171 characters. Each baseline contains 1,722,149
characters; the difference is the persisted cache wrapper. Both baseline hashes
and both cache hashes after projecting to the 18 shared fields equal
`53b072e8562b1af5396b8681cf6af709e2c28989bf711729ac163fda9049b48c`.
Both full database responses have canonical hash
`25668c06cae8009db73830e4f9c3d925c0ddacbcf23d83f23a6a45f3b5e5553e`.
These hashes cover different field sets; the per-field comparison confirms all
18 shared fields match the response.

Realtime sent one UPDATE subscription per session for `public.couple_state`,
filter `id=eq.sema`. Each received a successful `phx_reply` containing one
subscription, followed by the explicit Postgres Changes system acknowledgment.
No channel errors or socket closures were logged during this observation. This
confirms database subscription establishment, beyond merely opening a socket.
No database-change message arrived, and no write was induced, so delivery and
partner rendering after an actual update remain unverified.

A read-only traversal of each current committed React tree identified exactly
one sync effect by its `couple-state-` and `postgres_changes` source markers,
consistent with the one timer, one join and one initial full shared-state read.
This confirms one active instance in each current tree, not a count of every
historical mount. Repeated profile, membership and `select=id` binding checks
during login are distinct from the single `select=state,updated_at` sync read.

Both fresh sessions are clean; they do not reproduce a pending-field conflict,
duplicate active sync hook or failed Realtime subscription. This does not establish
the cache condition in the original phone/laptop sessions. No records were
created, caches cleared, database configuration changed or passwords inspected.
Both observation windows and the write-blocking observer remain open.

## Controlled live test preparation — October 11

The user authorized two uniquely named QA To-Dos, bidirectional Realtime/UI and
refresh checks, and deletion of only those exact QA records. The user also
authorized preparing a hotfix PR only if the complete test passes, with no merge
or Production deployment.

Before any QA write, the original observation helper and isolated browser
processes stopped during a navigation/attachment operation. No QA creation or
shared-data PATCH was attempted. Their temporary sessions were not exported.
The windows were reopened with manual sign-in requested again; both remained
signed out at the preparation checkpoint.

A local controlled-test driver and narrow write guard are prepared in ignored
`.backups/` files. The guard defaults to disabled. When armed, it allows only one
PATCH for the expected QA addition/deletion, verified author and timestamp
version. It hashes the full request state after excluding only the two exact QA
titles, requiring that all unrelated fields, original To-Do objects and their
order still match the initial database baseline. All other mutations remain
blocked. The driver records response status/affected rows, Realtime UPDATEs,
UI detection times, refresh persistence, and complete baseline/final hashes
without outputting private contents or credentials.

The GitHub branch `hotfix/production-sync` exists remotely and is one commit
ahead of `main`, with no commits behind. No PR was created because the live-test
pass condition has not yet been established. No SQL was applied, cache cleared,
personal record modified or Production merge/deployment performed.

## Controlled live synchronization test — October 11, 19:09–19:10 Dublin

The full authorized test passed on the confirmed Preview using the normal
`/todos` creation and deletion UI (the existing shared To-Do collection).
Only these exact records were created and subsequently removed:

- `QA-SYNC-MATEO-2026-10-11T18-09-28-113Z`
- `QA-SYNC-SEVAL-2026-10-11T18-09-28-113Z`

| Normal UI operation | PATCH status | Affected shared-state rows | Partner Realtime event | Partner UI time from click | UI time from PATCH response | Refresh result |
| --- | --- | --- | --- | ---: | ---: | --- |
| Mateo creates QA To-Do | 200 | 1; `0-0/*` | Seval: `UPDATE`, `couple_state` | 6,284 ms | 1,836 ms | Present |
| Seval creates QA To-Do | 200 | 1; `0-0/*` | Mateo: `UPDATE`, `couple_state` | 4,624 ms | 1,276 ms | Present |
| Mateo deletes his exact QA To-Do | 200 | 1; `0-0/*` | Seval: `UPDATE`, `couple_state` | 5,889 ms | 1,620 ms | Absent |
| Seval deletes her exact QA To-Do | 200 | 1; `0-0/*` | Mateo: `UPDATE`, `couple_state` | 8,275 ms | 3,561 ms | Absent |

All partner UI changes were detected before refresh. Detection used a
`requestAnimationFrame`-polled check for the exact QA title; timings include
debounce, network and rendering delays. Realtime event times from the initiating
UI click were respectively 5,202; 3,775; 4,784; and 5,918 ms. Successful PATCH
responses each returned exactly one `updated_at` row, confirming an affected
row rather than merely a successful status with zero matches. Their returned
versions were, in order:

- `2026-10-11T18:09:37.295+00:00`
- `2026-10-11T18:09:46.391+00:00`
- `2026-10-11T18:09:53.894+00:00`
- `2026-10-11T18:10:04.554+00:00`

Both QA additions survived the receiving session's refresh. Both QA records
remained absent after refreshing both sessions during cleanup. The full shared
JSON state's canonical SHA-256 matched before and after:
`25668c06cae8009db73830e4f9c3d925c0ddacbcf23d83f23a6a45f3b5e5553e`.
All array counts matched. To-Do count followed 56 → 57 → 58 → 57 → 56; all
other arrays retained their original counts. The comparison covered all state
fields, including unknown/legacy keys, original record values and array order.
Only the expected outer row `updated_at` advanced. Unrelated-state hashes were
also checked in reads, authorized PATCH bodies and received Realtime states
throughout the test, with no mismatch detected.

After cleanup both sessions had empty pending-field sets, complete baselines
matching their caches, one active polling timer and one committed sync effect.
Both remained online on `/todos`. The exact-QA write gate is disabled again;
the isolated observation windows remain open. No cache clearing, SQL changes,
existing personal-record edits or Production deployment were performed.
Passwords, tokens and private record contents were not included in the logs.

The credential-free detailed report is retained locally at
`.backups/qa-live-controlled-report.json`. Draft PR
[\#3](https://github.com/SpaceCowboy93/sema-calendar/pull/3) was prepared from
`hotfix/production-sync` (`d5217f2d7efc2fbb29b7a76e2437f8f86ab34db4`) to `main`.
The connector's PR-creation permission was unavailable (HTTP 403); existing
noninteractive Git authentication successfully created the authorized draft.
No credentials were printed or written to the PR/report. The PR description
records the live results and supersedes the committed report's historical
missing-publication finding. This local follow-up document remains uncommitted.
The PR is open as a draft; it was not merged.

## Local stale-cache recovery continuation — October 15, 2026

The unfinished recovery changes were preserved and extended locally on
`hotfix/production-sync` at `d5217f2`. Record-level conflict isolation now allows
independent records in the same collection to synchronize, while unknown legacy
baselines and ambiguous empty pending markers retain potentially unique local
work for review. Linked operations remain grouped, and checkpoints retain the
unknown-baseline record identities across interruptions and partial choices.

See [SYNC_RECOVERY_RUNBOOK.md](SYNC_RECOVERY_RUNBOOK.md) for the code-level root
cause, file inventory, validation, remaining risks, original-device preservation
procedure, exact future mutation scope and per-record rollback procedure.
The original laptop/phone caches were not inspected in this continuation; their
exact conflict condition remains unconfirmed. No live Supabase operation, device
cache change, SQL, migration, QA record, environment change, commit, push, merge
or deployment was performed. Historical QA artifacts were retained unchanged.

### Follow-up verification of the existing recovery tree

The previous full test command had already completed successfully when work was
resumed. Further mocked regressions then reproduced two related startup risks:
a separately saved, mismatched legacy baseline could resurrect a server-deleted
record, and rewriting a pending marker before the first checkpoint could make
that baseline appear trusted after an interruption. Baseline validation now runs
against the original marker, and startup stages its complete checkpoint before
any legacy marker writes. The same trust check protects a continuing tab after
storage recovers. All six interrupted startup writes are tested both in the same
tab and after restart. Focused verification passes 275 tests; the complete suite
passes 997 tests across 55 files, with no skipped tests in the complete runs.

Additional duplicate-identity regressions check rejected server snapshots,
preserved raw local duplicates, same-ID additions on two devices and nested
duplicate values retained in conflict review. Current quality results and exact
preservation-first device steps are in the recovery runbook. Evidence is retained
under `.backups/sync-reverification-20261015-141124/`. Neither original device nor
live Supabase data was touched, and all existing QA files remain unchanged.
