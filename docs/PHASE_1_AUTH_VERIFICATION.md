# Phase 1 authentication verification — 2026-09-23

Update, 2026-09-24: the database blocker below is resolved. See
[the approved rollout and live verification](PHASE_1_AUTH_ROLLOUT.md).
The remainder of this document records the earlier 2026-09-23 verification.

Branch: `security/phase-1-auth-foundation`. Existing work was preserved. No
commit, push, deployment, database mutation, or Planner feature work was performed.

## Local verification

- TypeScript, lint, and production build pass. Existing image/hook lint warnings
  remain outside this work.
- Full Vitest suite: 327 tests pass, including 22 focused auth/session/sync tests.
  The existing toast test emits an `act` warning.
- Production server on localhost: login form renders without browser errors;
  signed-out visits to `/together`, `/planner`, `/us`, and `/auth/mateo` return
  to login. All 11 tested API method/route combinations reject missing
  credentials with 401, including the server-only push endpoints.
- Verified session restoration, profile-derived identity, missing membership,
  expiry/sign-out, stale async results, authenticated fetch, and scoped sync
  using isolated tests. Real password login and two-device sync are not verified.
- Fixed legacy cache import marking absent fields as pending: an older partial
  cache can no longer upload defaults over remote fields it never contained.
  The original legacy cache is retained.
- Added server authorization and session regression tests; configured Vitest
  to resolve Next's `server-only` marker. Updated outdated auth comments.

## Confirmed blocker in the configured Supabase project

Read-only queries against `neyhoodxeumpbxekskej` confirmed:

- Mateo and Seval profiles belong to the same couple.
- Recorded migrations are `20260917202204` and `20260917202240` only.
- `couple_state.couple_id` does not exist. The local access resolver requires it
  and intentionally denies access without a verified binding.
- RLS is disabled on `couple_state` and `push_sync_log`.
- The anonymous role has SELECT and UPDATE privileges on `couple_state`.
  Consequently the live shared state is not protected by the new local UI/API
  guards; direct database access remains unsafe.
- `event-photos` remains a public bucket. This phase does not make photo URLs
  private.

The initial auth migration was applied; the separate
`20260922164816_bind_sema_and_enforce_member_access.sql` migration was not.
No migration was replayed or applied during this verification.

## Exact next step

Review and apply only the pending binding/access migration to the configured
project as an explicitly authorized database rollout. It binds the existing
`sema` row without replacing its JSON and adds the required grants/RLS. Do not
replay the archived notification/storage scripts. Confirm its preconditions
against live schema immediately before applying.

Then verify both real accounts locally: login, refresh/session restoration,
logout/account switch, authorized API calls, and cross-device shared-state sync.
Verify anonymous/nonmember reads and writes are denied before calling Phase 1
complete or starting Planner Week/To-Dos integration.

Legacy whole-document sync still has concurrent-edit/deletion conflict risks,
and cached household data remains in localStorage after logout to preserve
unsynced work. Neither is a private/encrypted storage guarantee.
