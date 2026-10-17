# Release Candidate Data Audit

**Branch:** `security/phase-1-auth-foundation`
**Date:** 2026-10-08
**Auditor:** Claude Code (automated review)
**Commits reviewed:** 5 (f0287d7 → a86a538, relative to `main`)

---

## Executive Summary

The five commits introduce: email/password authentication with safe error
classification, a critical egress fix (background-tab polling guard), fallback
polling raised to five minutes, and regression tests for all three behaviors.

**No data-loss or data-corruption path was found.** The authentication flow
correctly validates couple membership before any shared state is loaded. The
three-way sync merge is mathematically sound and all edge cases tested pass.

The only blocker for production is an unrelated billing restriction on
Supabase project `neyhoodxeumpbxekskej` (HTTP 402, `exceed_egress_quota`,
active as of 2026-10-08). This branch cannot be exercised end-to-end until
that restriction is lifted via the Supabase dashboard.

---

## Commits Reviewed

| Commit  | Type | Summary |
|---------|------|---------|
| f0287d7 | test | P8 regression coverage: a11y, notifications, push |
| 04812a6 | fix  | Distinguish service outages from invalid credentials |
| 8419371 | fix  | Pause background-tab polling (visibility guard) |
| c1477e6 | fix  | Reduce fallback poll to 60 s + online listener + timer reset |
| a86a538 | fix  | Extend fallback poll to 300 s (5 min) — fits free-tier budget |

---

## Findings by Severity

### ~~MEDIUM~~ FIXED — Inconsistent error classification on mount-time redirect

**File:** [src/app/page.tsx](../src/app/page.tsx) line 24
**Status:** Fixed — commit `fix(auth): classify mount-time access errors safely`
**Tests:** [src/__tests__/pages/landing-mount-errors.test.tsx](../src/__tests__/pages/landing-mount-errors.test.tsx) (8 cases)

The `useEffect` previously surfaced `failure.message` directly while the
sign-in submit handler correctly used `classifyAuthError`. The single-line fix:

```ts
// Before
setError(failure instanceof Error ? failure.message : 'Unable to verify account access.')

// After
setError(classifyAuthError(failure))
```

The existing 401 guard is preserved: a 401 AccessError ("not signed in") is still
silently suppressed. All other failures now go through `classifyAuthError`, which
maps HTTP 402/5xx to a service-unavailable message, TypeErrors to a network
message, and AccessErrors to their safe app-written messages. Unknown errors
receive a generic fallback. Raw internal messages are never rendered.

Regression tests cover all eight paths in `landing-mount-errors.test.tsx`.

---

### LOW — `throw signInError` preserves `.status`; relies on duck-typing

**File:** [src/app/page.tsx](../src/app/page.tsx) line 36
**Status:** Correct; worth documenting

Before this commit, the sign-in error was re-wrapped:
```ts
throw new Error(signInError.message)
```
This stripped the `.status` field that `classifyAuthError` uses (Rule 2).

The fix (`throw signInError`) correctly preserves the Supabase `AuthError`
shape. `classifyAuthError` reads `.status` via duck-typing
(`'status' in error`), not via `instanceof AuthApiError`, so no Supabase SDK
type needs to be imported. This is intentional and correct.

---

### INFO — `selectSharedState` zero-value and false-value handling

**File:** [src/lib/shared-state.ts](../src/lib/shared-state.ts) line 19–22
**Status:** Correct; regression tests added (see Part 2)

`monthlyIncome: 0`, `boomBoomCount: 0`, and `focusCarryOver: false` all pass
through `selectSharedState` correctly:

- `typeof 0 === 'number' && Number.isFinite(0)` → `true` → value kept
- `typeof false === 'boolean'` → `true` → value kept

This means setting income to zero or disabling focus carry-over will sync
correctly and will not be silently dropped. No change needed; tests added to
confirm this invariant.

---

### INFO — `sameValue([], [])` is intentionally true

**File:** [src/lib/sync-merge.ts](../src/lib/sync-merge.ts) line 9–11
**Status:** Correct

Two empty arrays compare as equal (`length 0`, `every()` vacuously true).
This means clearing a list (e.g., deleting all events) is recognised as "same
as base" only when base is also empty. If base had items, the empty local array
signals a deletion and the merge proceeds into the array-id path. No action.

---

### INFO — Realtime channel per lifecycle, not per couple

**File:** [src/hooks/useSupabaseSync.ts](../src/hooks/useSupabaseSync.ts) line 253
**Status:** No data issue; minor resource concern

A new Realtime channel is created each time the hook mounts. If a route
unmounts and remounts quickly (e.g., tab close/open with React StrictMode in
dev), two channels could briefly overlap before the cleanup runs
`supabase.removeChannel`. This does not cause data loss because both channels
call the same `pull()` function which is guarded by `reading=true`. The extra
channel is cleaned up asynchronously. No action needed for production.

---

### INFO — `deleteShoppingList` reverses finance sync only for completed lists

**File:** [src/store/useAppStore.ts](../src/store/useAppStore.ts) lines 904–914
**Status:** Correct

Completed lists may have a linked `financeItemId`. On deletion, the store
un-does the finance entry (sets `isCompleted: false` to trigger the reverse
sync). Active (incomplete) lists have no finance entry, so the simple
`filter(l => l.id !== id)` is sufficient. No action needed.

---

## Saved-Data Lifecycle Coverage

| Phase | Covered by | Notes |
|-------|-----------|-------|
| Write to Zustand store | `store/*` tests | CRUD actions tested |
| Persist to localStorage | `couple-cache.ts`, `cache-isolation.test.ts` | Scoped keys verified |
| Upload to Supabase | `sync-visibility.test.ts` | CAS write path mocked |
| Three-way merge on pull | `sync-merge.test.ts` | 5 scenarios |
| Conflict detection | `shared-state-conflicts.test.ts` | 10 scenarios |
| Malformed remote rejection | `shared-state-conflicts.test.ts` | null, string, bad array |
| Pending-key round-trip | `cache-isolation.test.ts` | persist + restore |
| Cache isolation (couple A vs B) | `cache-isolation.test.ts` | separate keys |
| Stale cache / reconnect | `offline-reconnect.test.ts` | auth + reconnect |
| Logout safety | `logout.test.ts` | removeItem is no-op |
| Auth error classification | `classify-auth-error.test.ts` | 20 cases |
| Session invalidation | `security-session.test.ts` | generation counter |
| Background-tab poll guard | `sync-visibility.test.ts` (Tests 1, 4) | hidden → no poll |
| Online catch-up | `sync-visibility.test.ts` (Test 5) | online event → pull |
| Stale in-flight discard | `sync-visibility.test.ts` (Test 8) | unmount → no apply |
| Realtime immediate update | `sync-visibility.test.ts` (Test 9) | postgres_changes |
| Failed pull preserves state | `sync-visibility.test.ts` (Test 10) | error → no change |
| Zero-value numbers preserved | `shared-state-edge-cases.test.ts` | **newly added** |
| False boolean preserved | `shared-state-edge-cases.test.ts` | **newly added** |
| Empty array preserved | `shared-state-edge-cases.test.ts` | **newly added** |
| Invalid type rejection | `shared-state-edge-cases.test.ts` | **newly added** |
| Non-shared key isolation | `shared-state-edge-cases.test.ts` | **newly added** |

---

## 18 Shared Keys — Type Validation Summary

| Key | Type | 0/false/[] handled | Rejects wrong type |
|-----|------|-------------------|--------------------|
| events | array with string id | yes (empty []) | yes (non-array) |
| todos | array with string id | yes | yes |
| moods | array with string id | yes | yes |
| loveNotes | array with string id | yes | yes |
| wishlistItems | array with string id | yes | yes |
| countdowns | array with string id | yes | yes |
| memories | array with string id | yes | yes |
| goals | array with string id | yes | yes |
| partnerNotes | array with string id | yes | yes |
| shoppingLists | array with string id | yes | yes |
| monthlyIncome | number (isFinite) | yes (`0` passes) | yes (string/bool) |
| budgetItems | array with string id | yes | yes |
| savingsGoals | array with string id | yes | yes |
| financeMonths | array with string key | yes | yes |
| savingsTransactions | array with string id | yes | yes |
| focusActivities | array with string id | yes | yes |
| focusCarryOver | boolean | yes (`false` passes) | yes (0/1/string) |
| boomBoomCount | number (isFinite) | yes (`0` passes) | yes (string/bool) |

---

## Conclusion

The branch is safe to merge once the Supabase billing restriction is lifted.
The MEDIUM finding (inconsistent error path on mount) is a cosmetic issue that
can be addressed in a follow-up commit without blocking the release.

**Required before merge:**
1. Resolve Supabase quota restriction via billing dashboard
2. End-to-end smoke test on restored project (`npm run test:e2e`)

**Optional follow-up (non-blocking):**
1. Apply `classifyAuthError` to the mount-time catch in `src/app/page.tsx`
