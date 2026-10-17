# Phase 1 binding/access rollout - 2026-09-24

Project: `neyhoodxeumpbxekskej`.

Applied only the user-approved `bind_sema_and_enforce_member_access` migration
through Supabase MCP. Supabase recorded version `20260924152904`; the local
file was renamed to match that recorded version, preserving its applied SQL.
Its original preparation comments describe the pre-rollout state.
The two existing auth migrations were not replayed. Remote history now contains
exactly three migrations. No commit, push, app deployment, or Planner work occurred.

## Data preservation

- The existing `sema` row is bound to couple
  `3de918c1-fccc-454d-8618-8dce607ea4d8`.
- Exactly one shared-state row remains.
- Before migration, after migration, and after all verification, the JSONB text
  checksum was `ab9bc46eb4df0f80323a8c7845416c30` (MD5 used only for comparison).
- The original timestamp remains `2026-09-21T20:30:28.368+00:00`.
- Existing Auth accounts, profiles, memberships, push data, and Storage were
  not recreated. Verification created and signed out isolated Auth sessions;
  no email was sent and no password was changed.

## Live verification passed

1. All seven migration-targeted tables have RLS enabled. Anonymous shared-state
   SELECT and UPDATE privileges are absent.
2. Public Data API calls using the anonymous key returned HTTP 401 with database
   error `42501` for both shared-state read and write probes.
3. Transaction-scoped tests used the `authenticated` role and each partner's
   actual user ID. Both resolved their own profile, membership, and the same
   `sema` row. Mateo wrote a temporary JSON key which Seval read, then Seval
   changed it and Mateo read it. All these test writes were rolled back.
4. A nonmember identity saw zero rows and updated zero rows. Anonymous SQL
   reads/writes failed. A member could not change the `couple_id` binding.
5. Two separate Supabase clients authenticated to the existing Mateo and Seval
   accounts through admin-generated, unsent magic links. Each identity was
   verified with `getUser`; profile and membership queries used the caller's
   authenticated session, not the service role.
6. Each authenticated client could read the same shared JSON. Mateo changed only
   `updated_at`, Seval observed it by polling, and the original timestamp was
   restored. The reverse direction also passed. Timestamp writes/restoration
   used conditional filters to avoid overwriting concurrent changes. Shared
   JSON was never rewritten by these API probes.
7. Both isolated verification sessions were signed out with `scope: 'local'`.
   Tokens stayed in process memory and were not printed or saved.

The API verification script is in ignored `.backups/verify-binding-api.cjs`.
It requires local Supabase environment variables and creates transient login
sessions, so it is a manual live verification tool, not an automated unit test.

## Remaining scope and limitations

Database authorization and authenticated API polling in both directions are
verified. Password entry, browser session restoration, the actual UI/store sync
hook across two devices, and mobile push delivery were not exercised in this
rollout. Prior local test/build results remain recorded in
`PHASE_1_AUTH_VERIFICATION.md`; app code was not changed or deployed here.

The security advisor reports three informational notices for push tables with
RLS and no client policies, matching their intentional server-only access:
[RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
It also reports existing
[leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
No additional configuration changes were made.

Public photo URLs, localStorage retention after logout, and existing
whole-document sync conflict risks remain outside this migration. Phase 1 as
a whole is not declared complete until its remaining browser/device checks pass.
