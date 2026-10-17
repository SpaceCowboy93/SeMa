# Phase 1 authentication browser verification

Verification started September 25, 2026; resumed September 26 after interruption.
Phase 1 is **not complete**. This is a verification record, not a deployment approval.

**September 26 narrowed pass completed:** both identities, refresh restoration,
full browser restart restoration, and sequential logout isolation in both directions
passed. Both isolated sessions were signed out at the end and the test browsers
were closed. The earlier concurrent-transition race was not fixed or reclassified.

**September 26 fixes applied (automated — not browser/device verified):**

1. **Concurrent save / lost partner additions** — fixed. `useSupabaseSync` now uses
   read-rebase-conditional-write with optimistic compare-and-swap
   (`eq('updated_at', ...)`, bounded 3-attempt retry). Regression tests pass.
2. **Deleted items reappear** — fixed. `applyRemote` uses `rebaseSharedState`;
   clean fields accept authoritative remote state, not a union with stale cache.
   Regression tests pass.
3. **Logout `signOut` race** — fixed. `signOut({scope:'local'})` is now guarded
   with `if (!getAuthContext())` so a new login that starts before the session
   fetch resolves will not have its stored token cleared. Regression test passes.
4. **Long-delay notification timer overflow** — fixed. `MAX_TIMER_DELAY = 2^31−2`
   caps all `setTimeout` delays in `useNotifications`. Reminders for November
   events (and any event >24.8 days away) are now skipped at scheduling time and
   rescheduled by the existing visibility-change handler. Regression tests pass.
5. **TypeScript target missing** — fixed. Added `"target": "ES2017"` to
   `tsconfig.json`; resolves Set/Map iteration TS2802 errors in `sync-merge.ts`
   and `useSupabaseSync.ts` introduced by the security branch.

**September 26 fixes applied (second round — not browser/device verified):**

5. **Dream time/details disappear when reopening from Today Events** — fixed.
   `EventModal` now reads from the linked Goal as fallback for `startTime`,
   `notes`, `todos`, and `photos` when the CalendarEvent is sparse (covers
   Dreams created before the store-level sync fix). Store-level `addGoal` and
   `updateGoal` also now copy `startTime`, `checklist→todos` to the linked
   event so new Dreams are fully self-contained.
6. **Dream checklist and photo missing in CategoryHub edit form** — fixed.
   `openEdit` for type=`'dreams'` now loads `checklist` and `photos` from the
   Goal into edit state; `saveEdit` writes them back; the form renders both
   sections (checklist add/remove + photo thumbnails).
7. **Input text clipped / `py-0` override ignored** — fixed. `cn()` in
   `src/lib/utils.ts` now uses `twMerge(clsx(inputs))` (added `tailwind-merge`
   dependency). Conflicting Tailwind classes are now properly deduplicated, so
   `triggerClassName="px-0 py-0"` overrides correctly suppress the base
   `px-4 py-3` padding in `TimePicker` and `DatePicker` triggers.
8. **`endTime` never saved in EventModal** — fixed (previous round). `data`
   object in `handleSave` now includes `endTime: endTime || undefined`.

**Current automated verification (September 26, round 4):** 378/378 Vitest tests pass
across 26 files. `npm run typecheck` clean. `npm run lint` clean (pre-existing
`<img>` warnings only).

**Deployment note (September 26 round 2):** Preview deployed at
`https://sema-calendar-4g3318n99-mateo-s-projects123.vercel.app`. Build clean
(warnings only, no errors). Includes all round-1 and round-2 fixes. Supabase
env vars are still required for live sync and push; those are not verified in
this automated pass. Issue remains OPEN pending manual browser verification.

**Deployment note (September 26 round 3):** Preview deployed at
`https://sema-calendar-emzsoq3pk-mateo-s-projects123.vercel.app`. Build clean
(warnings only, no errors). Fixes Dream checklist atomicity: `addGoal` now
accepts `checklist` as its 7th parameter and sets `goal.checklist` + `event.todos`
in the same atomic store write as `startTime` — mirroring the pattern that fixed
time visibility. `FullCreateSheet` passes `checklist` at creation instead of a
separate `updateGoal` call (which could silently no-op if `addGoal` returns `''`).
5 new store regression tests added (goal-event-sync + dream-event-hydration).
Dream checklist issue remains OPEN pending manual browser verification.

**Deployment note (September 26 round 4):** Preview deployed at
`https://sema-calendar-ldlwcu14l-mateo-s-projects123.vercel.app`. Build clean.
Fixes Dream `notes` field: `addGoal` now copies `notes` to the linked CalendarEvent
(same pattern as `startTime`). `updateGoal` syncs `notes` to the linked event in all
4 code paths (date changed with existing event, date changed with orphaned event,
date added from scratch, non-date changes). This makes `notes` resilient: `event.notes`
is always set so it never relies solely on the `linkedGoal` fallback.
Full Dream field audit performed: `title`, `startTime`, `checklist→todos`, and `notes`
are all atomically set on both `goal` and `event` at creation. `photos`/`backgroundPhoto`
remain goal-only (uploaded async post-creation; EventModal fallback sufficient).
7 new store regression tests added (notes copy, notes sync, full-field creation,
full-field update, notes-not-wiped-by-partial-update).
Dream notes issue remains OPEN pending manual browser verification.

September 26 scope clarification: verify only identity, session restoration and
logout isolation after manual login. Samsung S24 / Chrome real mobile push is
**blocked** because no HTTPS URL serves the undeployed local version. The optional
month-end endpoint probe is **skipped at the user's request**. No fixes or live
sync edits are authorized in this verification pass. The isolated runner now denies
notification permission, blocks service workers and all push routes, and blocks
all HTTP mutations except Supabase session login/refresh/logout.

## Scope and preservation

- Local working tree only, against the existing Supabase project.
- No application-code edits, schema changes, live shared-state edits, Planner work,
  commits, pushes, or deployments were made during this verification.
- Passwords are entered manually in visible isolated browsers. Verification scripts
  do not read password fields or print access/refresh tokens. Browser-managed session
  storage lives in ignored `.backups/phase1-browser/` profiles.
- Browser interception blocks shared-data and push API mutations during identity
  and session checks. Login, session refresh, logout, and authorized reads remain real.
- Adversarial sync/logout tests use mocks, never the live shared document.

## Results so far

| Requested check | Status | Evidence / remaining work |
| --- | --- | --- |
| Mateo login and identity | Passed September 26 | Manually entered login; Supabase `getUser` returned 200, profile was `mateo`, app store and visible greeting were Mateo. |
| Refresh and browser restart | Passed for both accounts September 26 | Both persistent browser processes were gracefully closed and relaunched. Both accounts restored without credentials; subsequent refreshes preserved each identity. Both authenticated API checks returned 200. |
| Seval in separate browser | Passed September 26 | Independent persistent profile; verified Supabase user, profile `seval`, app identity and visible greeting all matched. |
| Bidirectional sync without overwriting newer data | **Fixed — automated tests pass; live cross-device not yet run** | read-rebase-conditional-write with CAS. 14 regression tests cover concurrent adds, deletions, restart, contention, stale-cache suppression. Live two-device test pending deployment. |
| Logout scoped to correct session/cache | Sequential isolation passed in both directions; race fixed | Each actual Sign out button sent `scope=local`, removed only that browser's session and returned to login. The other account remained verified. `signOut` race guard added September 26; regression test passes. |
| Mobile permission/subscription/test/reminder delivery | **Blocked — deployment required** | Samsung S24 / Chrome. Security branch not yet deployed. In-app timer overflow fixed September 26. Real-device delivery and cross-device live sync still pending. |

## Verified boundaries

September 26 sanitized evidence is saved under ignored `.backups/phase1-browser/`:
`mateo-after-restart.json`, `seval-after-restart.json`, `mateo-after-refresh.json`,
`seval-after-refresh.json`, `mateo-logout.json`, and
`seval-after-mateo-logout.json`, `mateo-before-seval-logout.json`,
`seval-logout.json`, `mateo-after-seval-logout.json`, and both
`*-signed-out-after-refresh.json` files. Both final browser permission checks report
`denied`; no subscription/test/reminder actions are part of this pass.
The first CDP permission override did not persist after detaching its session;
inspection caught this and it was replaced with a context-wide denial before the
recorded restart/refresh/logout checks. No server notification send was invoked.

Seval's observed logout after Mateo's second login was the explicit automation
test action: her session was present before the click, and the app sent the local
logout request only when the Sign out button was clicked. It was not evidence of
Mateo's login invalidating Seval's session.

The final extra Mateo cleanup click timed out in Playwright's action wait; the
subsequent refresh and inspection nevertheless confirmed no stored session and a
visible login form. Four shared-state PATCH attempts during cleanup were blocked
by the browser guard. Their source was not investigated in this narrowed pass;
local caches were preserved. The final database preservation check below passed.

- Blank login screen renders without a framework error overlay or page errors.
- Mateo's authorized browser read matched all 17 shared fields present remotely.
- Local `/api/sync-test` returned 200 with Mateo's session.
- Mateo requesting Seval's `/api/push/status` returned 403.
- Ten missing-credential route/method checks returned 401: push status, subscription
  POST/DELETE, test, reminder sync, process, send, receipt scan, photo upload, sync-test.
- Month-end scheduling GET returned 405 because that route supports POST. This is
  not an authorization result. Automatic approval review rejected the optional
  empty unauthenticated POST probe as a scheduling-endpoint mutation; it was not
  executed and remains excluded from the pass count. User explicitly requested
  skipping this optional check on September 26; no approval is outstanding.
- The first local server's network sandbox caused `EACCES` to Supabase and misleading
  401s for authenticated API requests. Restarting with network access resolved those
  requests to 200/403 as expected; this was an environment issue.

## Reproduced failures and fixes

1. **Lost concurrent additions — FIXED September 26.** `useSupabaseSync.ts` now
   reads, rebases, and conditions the write on `updated_at`. 14 regression tests
   including partner-addition preservation, deletion propagation, restart, stale-cache
   suppression, compare-and-swap retry, and clock skew all pass.
2. **Deleted items reappear — FIXED September 26.** `applyRemote` uses
   `rebaseSharedState`; clean fields accept authoritative remote state rather than
   unioning with stale cache. Regression test passes.
3. **Logout/account-switch `signOut` race — FIXED September 26.** `logout.ts` now
   guards `signOut({scope:'local'})` with `if (!getAuthContext())`. The isolated
   mock race in `.backups/phase1-browser/` remains as a historical record; the
   regression test in `src/__tests__/lib/logout.test.ts` passes.
4. **Long-delay in-app reminders fire early — FIXED September 26.**
   `useNotifications.ts` now caps all `setTimeout` delays at `MAX_TIMER_DELAY =
   2**31-2`. Far-future reminders are skipped at scheduling time and rescheduled
   by the existing visibility-change handler. Regression tests pass.
5. **Dream time/details empty in Today Events path — FIXED September 26.**
   `EventModal` falls back to linked Goal for all sparse fields; `addGoal` now
   copies `startTime` to linked event. 9 store regression tests pass
   (`src/__tests__/store/goal-event-sync.test.ts`).
6. **Dream checklist/photos missing in CategoryHub edit — FIXED September 26.**
   `openEdit` loads and `saveEdit` persists checklist + photos. 10 store
   regression tests pass (`src/__tests__/store/dream-event-hydration.test.ts`).
   **Dream checklist not visible after creation — FIXED September 26 (round 3).**
   Root cause: `FullCreateSheet` called `addGoal` then a separate `updateGoal`
   for the checklist; if `addGoal` returned `''` (null user race), `updateGoal('')`
   silently did nothing. Fix: pass `checklist` as 7th param to `addGoal`, set
   atomically. 5 additional regression tests pass.
   **Dream notes not visible when reopening — FIXED September 26 (round 4).**
   Root cause: `addGoal` and `updateGoal` never copied `notes` to the linked
   CalendarEvent. `event.notes` was always `undefined`. `EventModal` fell back to
   `linkedGoal?.notes` — but with no `event.notes` safety net, any failure to find
   the linked goal silently dropped notes. Fix: `notes` is now copied to the linked
   event at creation and synced in all 4 `updateGoal` code paths (same pattern as
   `startTime`). 7 additional regression tests pass. **Browser verification PENDING.**
7. **Input `py-0`/`px-0` override ignored — FIXED September 26.** `cn()` in
   `src/lib/utils.ts` now uses `twMerge(clsx(inputs))` via `tailwind-merge`.
8. **`endTime` never saved in EventModal — FIXED September 26 (first round).**

## Tests and reproduction

September 25: 22/22 auth suite passed; combined run was 335 passed, 3 failed
(two sync cases + logout race). September 26 round 1: all four failures fixed
(347 tests). September 26 round 2: Dream edit bugs fixed, `tailwind-merge` added.
**Current: 366/366 tests pass, 26 files, zero failures.**

Ignored verification assets:

- `.backups/phase1-browser/sync-verification.test.ts`
- `.backups/phase1-browser/logout-verification.test.ts`
- `.backups/phase1-browser/vitest.config.ts`
- `.backups/phase1-browser/runner.cjs`, `control.cjs`, `inspect.cjs`

Reproduce the isolated cases from the project root:

```powershell
node node_modules/vitest/vitest.mjs run --config .backups/phase1-browser/vitest.config.ts
```

These are intentionally failing verification cases, not application fixes. They
remain outside the normal test-suite include pattern.

## Live data baseline

Read-only checks on September 25, September 26 before testing, and September 26
after all browser checks found the same baseline:

- One `couple_state` row (`sema`). JSONB text MD5 for comparison:
  `ab9bc46eb4df0f80323a8c7845416c30`.
- `updated_at`: `2026-09-21T20:30:28.368+00:00`.
- Existing subscriptions: Mateo 2; Seval 5.
- Existing reminders: 11 per account, 2 pending per account, including 1 overdue.
- Latest recorded `sent_at`: `2026-08-01T07:55:13.164+00:00` for both accounts.

These counts do not prove device receipt or identify why overdue delivery stopped.
The documented scheduler is external cron-job.org; no scheduler configuration was
changed and the production queue was not processed as a test.

## Exact remaining sequence (September 26)

All four code failures fixed; 347 automated tests pass. Outstanding:

1. **Deployment** — security branch has never been deployed. To continue:
   - **Option A (preview):** add `NEXT_PUBLIC_SUPABASE_URL`,
     `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the
     Vercel Preview environment (values already in `.env.local`; same project as
     Production); then run `vercel deploy` (not `--prod`). This creates a unique
     HTTPS preview URL without touching production.
   - **Option B (production):** commit + push + merge + deploy to production with
     explicit user approval. This updates `https://sema-calendar.vercel.app`.
2. **Samsung S24 push delivery** — blocked until an HTTPS URL is available.
3. **Cross-device live sync** — blocked until deployment.
4. **Month-end endpoint probe** — skipped at user's request; remains excluded.

On approval, proceed with Option A unless user requests Option B.
