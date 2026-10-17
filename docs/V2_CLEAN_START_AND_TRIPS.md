# V2 clean start and shared Trips — 17 October 2026

Scope: `SpaceCowboy93/SeMa`, branch `preview/supabase-v2-isolated`, Supabase
`wwxdinkdjkjiqzynfbdk`, Vercel `sema-calendar-v2-preview`
(`prj_3vEHTz7146jOPJh2Ax2B8OHKoux9`). The old repository/backend and Production
are outside this release. The original SeMaCalendar working tree is preserved.

## Backup and reset evidence

Before deletion, both users confirmed existing V2 clients were stopped. All eleven
public app tables and the `event-photos` bucket were inventoried. The eight content
tables were exported in one repeatable-read snapshot, together with account
mappings, bucket/object metadata and checksums of the protected foundation.
No passwords, tokens, keys or personal record contents were printed.

Private, Git-ignored backup location on the operator's workstation:
`C:/Users/mateo/SeMaCalendar/.backups/v2-clean-start-2026-10-17T20-15-37-731Z/`.
`v2-app-content.json` is 1,752,237 bytes and has SHA-256
`e92541f5a7ac53d8987247ee80e12f0b245b6818f0fe4cc5039986e850ca8687`.
It was reread, parsed, and hash-verified before deletion. `manifest.json` includes
row counts and SHA-256 checksums for each exported table. Storage contained zero
objects; embedded content and existing media references are included in the JSON.
No request to old-project media was made. This app-content backup is not a managed
whole-project/PITR backup or an export of passwords/Auth internals.

The live content checksum matched the backup. The reset transaction locked only
content tables, checked the expected inventory and content checksum, refused any
unbacked storage object, and then cleared:

| Content | Removed/reset |
| --- | --- |
| Shared document | 102 events, 57 To-Dos, 39 Dreams, 12 wishes, 60 partner notes, 9 love notes, 36 shopping lists, 38 focus activities, 15 countdowns, 7 memories |
| Finance and counters | 11 budget items, 2 savings goals, 4 finance months, 5 savings transactions; income/counters reset to zero |
| Activity feed | 12 rows |
| Notification preferences | 2 rows |
| Reminders | 12 rows |
| Device subscriptions | 2 rows |
| Push sync log | 2 rows |
| Separate calendar/checklist tables | Already empty; remain empty |
| Storage objects | Already empty; no files deleted |

The `couple_state` row, ID `sema`, and its household binding were preserved. Its
document was replaced by `emptySharedState()`'s canonical shape, including an empty
Trips collection. All arrays are empty, income/counters are zero, and carry-over is
false. The PostgreSQL JSONB document MD5 is
`9ae4f114ba65bd50ecd3f93816399091`.

Read-only verification found zero remaining rows across the seven non-state
content tables and zero storage objects. Both Auth accounts remain valid members.
Foundation/account-password fingerprints and schema/function/policy/grant
fingerprints match their pre-reset values. No schema, migration, policy, grant,
password, Auth configuration or Vercel environment variable was changed.
Private `reset-verification.json` records these comparisons.

## Cache generation and reload instructions

V2 now uses `semacalendar-v2:project:wwxdinkdjkjiqzynfbdk:generation:2:…` for
shared localStorage/IndexedDB recovery. Earlier V2 and V1 caches are neither imported
nor merged. Activity feeds, notification preferences and pending activity-upload
outboxes also use generation 2. Authentication keys are untouched; regression
tests verify old bytes remain unchanged but cannot enter the new build's state or
upload queue. Budget defaults in a new V2 cache are empty.

Mateo and Seval should open **the new Preview URL**, reload once, and sign in again
with their V2 account if prompted. No browser-storage editing is needed. Keep old
V2 tabs/PWAs stopped and do not reopen older deployment URLs: older binaries still
have their own authenticated write capability. Blocking those binaries at the
database would require a separate server/auth/schema change, which this task
expressly excludes. The new generation protects clients running the new build.

## Trips implementation

`/trips` is available from the main navigation; `/dev-preview/trips` provides a
development-only synthetic UI for offline mobile tests.

- Details: title, destination, country, dates, travellers, four statuses, budget,
  currency, notes, and optional cover upload through the existing authenticated
  storage route. A missing storage credential fails closed without changing a trip.
- Plans: day-by-day dated items with time, location, booking/information link,
  notes, estimated and actual cost, and completion. Types include activities,
  flights/transport, accommodation, restaurants and places to visit.
- Packing and booking checklists, shared notes and additional spending have stable
  record identities and accessible reorder/edit/delete controls. Explicit clears
  and zero spending values are retained.
- Manually saved recommendations include category, description, location, link,
  estimated price and notes. Conversion uses a stable itinerary identity and
  prevents duplicate conversion. The future Ask SeMa entry is clearly unavailable;
  no paid AI, recommendation provider or external API was added.
- Trips use the existing protected shared selector, conditional household/version
  writes, Realtime refresh, atomic offline checkpoints and recovery panel. The
  existing merge isolates a conflicting trip while allowing independent trips and
  other shared fields to proceed. Editor drafts merge independent changes, recheck
  overlapping choices, and cannot recreate a trip removed by a partner.
- Nested data, dates, amounts, identities, URLs and currency are validated before
  persistence. Server Auth/admin clients refuse a non-V2 endpoint. A build guard
  rejects a different backend or a privileged client key. Production CSP limits
  browser connections and images to this app and V2 (plus local data/blob images).

Main files: `src/types/trips.ts`, `src/lib/trips.ts`,
`src/lib/empty-shared-state.ts`, `src/lib/shared-state.ts`,
`src/lib/shared-cache-scope.ts`, `src/lib/user-cache.ts`,
`src/lib/activity-outbox.ts`, `src/store/useAppStore.ts`,
`src/components/trips/TripEditors.tsx`, `src/components/trips/TripsPage.tsx`, and
the two Trips routes/navigation entries. No database migration is needed.

## Local verification and release procedure

- Focused Trip/editor/native-cache suite: 33 tests passed; the additional V2
  cache-format/server suite passed 30 tests, including previous V2 formats.
- Full Vitest suite: **1,113 tests passed in 66 files**, no skips. The first run's
  sole failure was the old expected shared-field count; the assertion now includes
  all 19 fields and the final full run passes.
- Native browser workflow passed at **360, 390 and 430 px**: create, plan, complete,
  clear optional fields, persist across reload, delete, reload empty, labelled
  controls and keyboard reachability. No external browser requests occurred.
- TypeScript and ESLint passed; lint retains existing application warnings.
  Accessibility component checks passed. An invalid-backend build was refused.
- The optimized build passed. The compiled audit checked 187 JavaScript files:
  V2 endpoints and the generation boundary were present, with no old backend
  references. The final secret scan found zero findings in 275 text files, and
  the whitespace check passed (Windows CRLF is treated as an end of line).
  Verification logs are retained outside Git in the temporary checkout's parent.

The V2 Vercel project is linked to `SpaceCowboy93/SeMa` with Production branch
`main`. Push only the reviewed preview branch. Verify the resulting deployment is
Preview with the exact reviewed SHA; never promote it or assign Production domains.
Environment variables must remain unchanged.

Hosted two-account verification requires manual sign-in in fresh, isolated browser
contexts. No password is read by the automation. After confirming both see the
empty document, create one uniquely identified QA Trip, observe delivery without
refresh, edit, delete, reload both contexts, and compare the database to the exact
empty-document checksum above. Record the preview URL, timing, mutation counts,
QA cleanup and any remaining manual checks in private release evidence. Do not
claim hosted Realtime verification until that flow has actually completed.
