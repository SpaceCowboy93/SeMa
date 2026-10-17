# SeMa Application Health Audit

**Date:** 2026-09-26
**Branch:** `security/phase-1-auth-foundation`
**Auditor:** Claude Code (read-only — no code modified, no data touched)

---

## Audit Scope

This audit covers the production-ready state of the SeMa codebase on the
`security/phase-1-auth-foundation` branch. It does not fix anything; it only
records observations.

Checks performed:
- TypeScript, lint, full test suite, production build
- All route pages and navigation structure
- Goal/Dream ↔ Calendar bidirectional sync logic (code and tests)
- Test coverage analysis across all features
- Auth and sync architecture review
- Broken navigation links and orphaned pages
- Suspected risks requiring manual verification

---

## 1. Build Gate Results

| Check | Result | Notes |
|---|---|---|
| TypeScript (`tsc --noEmit`) | **PASS** | Zero errors |
| ESLint (`next lint`) | **PASS** | Warnings only — all pre-existing `<img>` and `react-hooks/exhaustive-deps` warnings |
| Vitest (`vitest run`) | **PASS** | 378 tests in 26 files; 1 pre-existing `act()` warning in C2Toast |
| Production build (`next build`) | **PASS** | 26 routes compiled; no errors |

All four gates are green. The branch is deployable from a build perspective.

---

## 2. Confirmed Working

- TypeScript strict mode enforced throughout with no violations.
- All 378 automated tests pass without failures or new warnings.
- Goal → Calendar sync is correct and well-tested:
  - `addGoal` atomically creates a linked `CalendarEvent` with `startTime`, `notes`, and `todos` (from checklist) when a `targetDate` is provided.
  - `updateGoal` syncs title, date, startTime, notes, and checklist→todos to the linked event; handles adding/removing dates; orphan-recovery logic for race-condition edge case.
  - `deleteGoal` removes the linked event; `deleteEvent` unlinks the goal without deleting it.
- Shopping → Finance sync: completed lists correctly write a `FinanceCategoryItem` into the current month's Shopping budget; un-completing removes it; month changes move the entry.
- Auth foundation (Phase 1 database migration applied):
  - RLS enabled on all seven targeted tables.
  - Anonymous SELECT/UPDATE on `couple_state` denied (HTTP 401 / pg error 42501).
  - Mateo and Seval each resolve their own profile, membership, and the shared `sema` row via their authenticated session.
  - Non-member identities see zero rows.
- `sync-merge.ts` rebase strategy correctly performs per-item merges on arrays with `id`/`key` identifiers, avoiding full-collection last-write-wins at the item level.
- Session invalidation on auth change is synchronous; stale async API results are rejected via generation counter.
- Logout revokes local session, clears active couple, instructs service worker to clear user state, and unsubscribes push on a best-effort basis.
- `/journey` and `/memories` routes correctly redirect to `/us`.
- `auth/[user]` route correctly redirects to `/`.
- Bottom-nav routes (`/together`, `/planner`, `/plans`, `/shopping`, `/us`) all exist and compile.
- Error boundaries at global, root, and `(app)` layout levels.
- `logger.ts` sanitises tokens, content, and photos before logging.

---

## 3. Confirmed Defects

### DEF-1 — HIGH: Calendar → Goal checklist sync is incomplete

**Location:** [EventModal.tsx:138-143](src/components/calendar/EventModal.tsx#L138-L143)

When the user edits a goal-linked calendar event through the `EventModal` and
changes the todo items (add, remove, reorder, or rename), the changes are
saved correctly on `CalendarEvent.todos` via `updateEvent()`. However, the
explicit `updateGoal()` call on line 139 only syncs `startTime` and `notes`
back to the goal — it does not convert the updated `todos` array back to
`Goal.checklist`.

Effect: reopening the same Dream from the Goals/Dreams section (CategoryHub)
shows the old checklist, not the edits made in the EventModal. The two views
diverge silently.

In comparison, `updateGoal` with a `checklist` update *does* correctly sync
the other direction (Goal → Event), so the sync is one-directional for this
field.

No automated test covers the EventModal-edit → goal-checklist regression path.
`dream-event-hydration.test.ts:87–102` only verifies that a `startTime`/`notes`
update via `updateGoal` does not wipe the checklist, which is a different path.

**Reproduction steps (no live data needed):**
1. Create a Dream with a targetDate and checklist items.
2. Open the linked event from the Calendar.
3. Add a new checklist item in EventModal and save.
4. Open the same Dream from the Goals page.
5. The new item is absent from the checklist.

---

### DEF-2 — HIGH: Five orphaned, unreachable pages

The following routes are compiled and served but have no navigation link
pointing to them anywhere in the application:

| Route | Page file | Previous purpose |
|---|---|---|
| `/calendar` | [calendar/page.tsx](src/app/(app)/calendar/page.tsx) | Standalone month-view calendar |
| `/goals` | [goals/page.tsx](src/app/(app)/goals/page.tsx) | Standalone Dreams/Goals page |
| `/todos` | [todos/page.tsx](src/app/(app)/todos/page.tsx) | Standalone To-Dos page |
| `/notes` | [notes/page.tsx](src/app/(app)/notes/page.tsx) | Standalone Love Notes page |
| `/wishlist` | [wishlist/page.tsx](src/app/(app)/wishlist/page.tsx) | Standalone Wishlist page |

The current UX replaces these with bottom-sheet panels (CategoryHub) opened
from the Home page and Planner. The standalone pages were not removed or
redirected. They have zero automated test coverage and their feature set may
have diverged from the sheet-based equivalents.

Risk: any deep-link or bookmark to these routes reaches functional but
out-of-date standalone UIs that users cannot discover through the app.

---

### DEF-3 — MEDIUM: Adding a date to an existing Todo does not create a Calendar event

**Location:** [useAppStore.ts:462-466](src/store/useAppStore.ts#L462-L466)

The `updateTodo` action includes an explicit comment:

> "If a date is now set but there was no linked event, we can't auto-create
> here (no currentUser access in set). We just update the todo fields."

Effect: if a user creates a Todo without a date and later edits it to add a
date, no `CalendarEvent` is created and the Todo does not appear on the
calendar. The only way to get a calendar-linked Todo is to create it with a
date from the start. Editing an existing Todo to add a date silently fails to
create the link with no user feedback.

---

## 4. Suspected Risks Requiring Manual Testing

### RISK-1 — CRITICAL: Auth Phase 1 browser verification incomplete

The `PHASE_1_AUTH_ROLLOUT.md` explicitly states:

> "Password entry, browser session restoration, the actual UI/store sync hook
> across two devices, and mobile push delivery were not exercised in this
> rollout. Phase 1 as a whole is not declared complete until its remaining
> browser/device checks pass."

The automated tests mock Supabase and the session layer. No human has yet
verified the full login → session restoration → logout → re-login cycle in a
real browser against the live Supabase project using Mateo's or Seval's actual
credentials.

Required manual checks:
- Password login flow (email + password form).
- Token refresh / session restoration after browser reload.
- Account switch (logout as Mateo, login as Seval in the same browser tab).
- Shared-state sync: edit made on device A appears within ~5 seconds on device B.
- Push notification delivery end-to-end.

---

### RISK-2 — HIGH: Shared data persists in localStorage after logout

After `logout()` clears the auth session, Zustand's `persist` middleware retains
the full shared-state JSON (events, todos, goals, notes, etc.) in `localStorage`
under key `semacalendar-v1`. This is intentional design (to preserve unsynced
work for the next login) but creates a security gap on shared or borrowed
devices: any person with browser access can read all couple data after the user
has logged out.

There is no "clear data on logout" option and no session timeout clears the
cache. The Phase 1 verification docs list this as a known limitation outside
the current scope.

---

### RISK-3 — HIGH: Key-level sync conflict silently drops user work

`rebaseSharedState` performs per-item merges within arrays (identified by `id`
or `key`). If both users independently modify *the same item* in a way that
cannot be three-way-merged (e.g., both change the same goal's title to different
values with no common base), the merge function throws. The sync hook catches
this and sets status to `'error'`, but there is no user-facing conflict
resolution UI. The conflicting local work is retained, but the conflict is
invisible to the user unless they inspect sync-status code paths.

Additionally, the sync status indicator (if any) was not tested for visibility
in user-facing flow. Manual verification is required to confirm users see a
meaningful signal when sync is in error state.

---

### RISK-4 — MEDIUM: Shopping list / receipt photos stored as base64 in shared state

`ShoppingItem.photo` and `ShoppingList.coverPhoto` accept base64 data URLs.
These are serialised into the shared-state JSON blob in Supabase's `couple_state`
JSONB column. Multiple lists with scanned receipts or item photos could push the
JSONB payload well above Postgres's practical JSONB row size and localStorage's
~5–10 MB limit, silently truncating or failing sync writes.

`event-photos`, `todos`, and Focus activity photos correctly use Supabase Storage
URLs. Shopping/receipt photos have not migrated to this pattern.

---

### RISK-5 — MEDIUM: Realtime channel failure is not surfaced to the user

`useSupabaseSync` subscribes to a Supabase Realtime channel and falls back to
a 5-second polling interval. If the Realtime subscription fails silently
(network issues, quota limits), the sync degrades to polling without any user
indication. The 5-second poll is still functional but increases data-loss window.
No automated test covers the Realtime-failure → polling-fallback path.

---

### RISK-6 — LOW: `event-photos` bucket is public; photo URLs are not access-controlled

Confirmed in `PHASE_1_AUTH_VERIFICATION.md`: "event-photos remains a public
bucket. This phase does not make photo URLs private." Anyone with a direct URL
can access event, todo, and focus-activity photos without authentication.

---

### RISK-7 — LOW: Push unsubscribe on logout is best-effort only

`logout.ts:43` catches all device-cleanup errors and logs a console warning.
If the DELETE request to `/api/push/subscribe` fails (e.g., network offline),
the push subscription is not removed and future push messages may still arrive
for the logged-out user. There is no retry on next login.

---

## 5. Missing Automated Coverage

Overall statement coverage: **28.16%** (branch coverage: 82.53%).

### Feature areas with zero test coverage

| Feature / File | Lines | Coverage |
|---|---|---|
| `CategoryHub.tsx` (Dreams, Wishes, Plans, Moments hub) | 1,667 | 0% |
| `FullCreateSheet.tsx` (primary creation UX) | 630 | 0% |
| `ShoppingListEditorSheet.tsx` | 545 | 0% |
| `EventModal.tsx` (Calendar and goal-linked event editing) | ~420 | 0% |
| `AnniversarySheet.tsx` | 430 | 0% |
| `GlobalImageLightbox.tsx` | 305 | 0% |
| `ReceiptScannerSheet.tsx` | 269 | 0% |
| `TimePicker.tsx` / `DatePicker.tsx` | ~476 combined | 0% |
| `auth.ts` (Supabase auth helpers) | — | 0% |
| `motion.ts` (animation utilities) | 131 | 0% |

### Feature flows with no regression tests

| Flow | Risk if broken |
|---|---|
| Calendar: add / edit / delete event | High — core UX |
| Calendar → Goal sync when editing event todos via EventModal | High — DEF-1 above |
| Todo: add with date (creates calendar event) | High |
| Todo: edit / complete / delete | Medium |
| Shopping: add list, add item, check item, complete list, receipt scan | High |
| Shopping → Finance sync on list completion | Medium (finance data affected) |
| Finance: create month, edit income, add budget item, generate report | Medium |
| LoveNotes: send, pin, delete | Low |
| Wishlist: add, complete, delete | Low |
| Memory: add with photos and checklist | Low |
| Planner weekly focus: add activity, complete, carry-over | Medium |
| Notification permission prompt and subscription flow | Medium |
| Logout: full device cleanup flow (lines 23–42 are uncovered at 55.5%) | High |
| E2E: no verified Playwright run against running dev server | High |

### Security test gaps

- No test confirms that a request with a revoked token is rejected by the API
  routes after the token is invalidated mid-flight.
- No test for the push endpoint rate-limiting or admin guard (`_admin.ts`, `_access.ts`).

---

## 6. Findings Priority Matrix

| ID | Priority | Category | Title |
|---|---|---|---|
| RISK-1 | Critical | Auth | Phase 1 browser verification not yet complete |
| DEF-1 | High | Sync | EventModal → Goal checklist sync gap |
| DEF-2 | High | Navigation | Five orphaned/unreachable pages |
| RISK-2 | High | Security | SharedState persists in localStorage after logout |
| RISK-3 | High | Sync | Sync conflict has no user-facing resolution |
| DEF-3 | Medium | UX | Adding a date to an existing Todo skips calendar link |
| RISK-4 | Medium | Data | Base64 photos in shared-state JSON risk size limits |
| RISK-5 | Medium | Reliability | Realtime failure not surfaced to user |
| Coverage | Medium | Quality | Core UI sheets have 0% test coverage |
| RISK-6 | Low | Security | event-photos bucket is public |
| RISK-7 | Low | Reliability | Push unsubscribe is best-effort with no retry |

---

## 7. Recommended Next Tasks (Priority Order)

### 1. Complete Phase 1 browser verification (Critical)
Perform the manual browser checks listed in `PHASE_1_AUTH_VERIFICATION.md` and
`PHASE_1_AUTH_BROWSER_VERIFICATION.md` using real credentials:
password login, session restoration, logout/switch, authenticated API calls,
cross-device shared-state sync, and push delivery. Only then declare Phase 1
complete.

### 2. Fix DEF-1: EventModal todo edits must sync back to Goal.checklist (High)
In `EventModal.handleSave`, when `event.linkedGoalId` is set and the `todos`
array has changed, call `updateGoal(event.linkedGoalId, { checklist: todos.map(t => t.title) })`.
Add a regression test: create a dream with checklist, open its event, add a
todo item, save, then verify `goal.checklist` contains the new item.

### 3. Resolve DEF-2: redirect or remove orphaned pages (High)
Decide whether `/calendar`, `/goals`, `/todos`, `/notes`, `/wishlist` should be
redirected to the home hub (recommended) or restored as deep-link targets with
proper navigation. Add redirects similar to `/journey` and `/memories` if they
are not needed as standalone pages.

### 4. Address localStorage data retention after logout (High)
Consider clearing shared-state keys from localStorage on explicit logout once
the unsynced-work use case is confirmed no longer needed, or add a warning/
confirmation dialog informing the user that data remains on this device.

### 5. Add regression tests for EventModal and CategoryHub (Medium)
These two components handle the majority of user interactions and have 0%
coverage. Start with store-level action sequences rather than full component
renders to keep tests fast and reliable. Priority scenarios:
- EventModal: edit goal-linked event todos → verify goal.checklist updated.
- CategoryHub: add/edit/delete a Dream, Wish, Plan, Moment.
- FullCreateSheet: create item of each type → verify store state.

### 6. Fix DEF-3: updateTodo with a new date should create a Calendar event (Medium)
Refactor `updateTodo` to accept an optional `currentUser` parameter or use
`get()` before `set()` to access the current user, enabling event creation when
a date is added to a previously undated todo.

### 7. Migrate shopping/receipt photos to Supabase Storage (Medium)
Replace base64 data URL storage in `ShoppingItem.photo` and
`ShoppingList.coverPhoto` with Supabase Storage uploads (following the same
pattern as event photos). This removes the JSONB/localStorage size risk.

---

## 8. Technical Debt Observations (No Priority Assigned)

- `useMemo` in `together/page.tsx:227` has a missing `router` dependency
  (pre-existing ESLint warning). Unlikely to cause a runtime bug but should be
  reviewed.
- 14 `<img>` elements across 8 files should be migrated to `next/image` for LCP
  performance (pre-existing lint warnings).
- `logout.ts` has 55.5% coverage; the device-cleanup path (lines 23–42) is
  entirely untested.
- `auth.ts` is at 0% coverage — the Supabase `getVerifiedAccess` helper that
  guards all route access is exercised only through integration, not unit tests.
- `FocusReminder` type has a deprecated single-reminder field alongside the new
  `reminders` array. Migration path for old data is not verified.
- The `Countdown` type has both a deprecated `checklist: string[]` and a
  `checklistEntries: ChecklistEntry[]` with completion state. No migration or
  coercion ensures old `checklist` entries are presented consistently.

---

*Report generated by automated read-only code and structure inspection.
No code was modified, no commits were made, no live data was read or written.*
