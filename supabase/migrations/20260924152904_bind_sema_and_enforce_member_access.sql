-- =============================================================================
-- 0005: Bind and secure the EXISTING SeMa household
-- =============================================================================
-- Applied to neyhoodxeumpbxekskej on 2026-09-24 15:29:04 UTC.
-- Confirmed in remote migration history on 2026-09-28.
-- This is a follow-up to ALREADY APPLIED migrations:
--   20260917202204 auth_foundation
--   20260917202240 auth_foundation_restrict_membership_function
-- Notification prerequisite tables/columns (local 0003) also already exist.
-- This local filename predates those remote versions: do not replay the whole
-- local migration directory. Reconcile migration ordering/history at rollout.
--
-- Seval: 426ec3c7-0354-4aea-99c9-688ca1baf610
-- Mateo: c74d2e29-99e9-4e10-8e7a-3a325932d2c6
-- Couple: 3de918c1-fccc-454d-8618-8dce607ea4d8
-- Verified baseline: couple_state has one 'sema' row, JSONB object, and NO
-- couple_id column, foreign key, user triggers or rewrite rules.
-- All seven tables exist. RLS is OFF on couple_state and push_sync_log.
-- Push couple_id columns remain TEXT ('sema'); do not rewrite them as UUIDs.
-- Accounts, profiles, membership, push rows and Storage are never recreated.
-- Not a bootstrap or a rerunnable migration: unexpected schema drift aborts.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Require every prerequisite. No IF EXISTS skips or replacement empty tables.
DO $preflight$
DECLARE
  table_name TEXT;
  expected RECORD;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Run this reviewed migration as the postgres migration role';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'couples', 'couple_members', 'couple_state',
    'push_subscriptions', 'push_reminders', 'push_sync_log'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = table_name
        AND c.relkind = 'r' AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) THEN
      RAISE EXCEPTION 'Missing or incompatible prerequisite table: public.%', table_name;
    END IF;
  END LOOP;

  FOR expected IN SELECT * FROM (VALUES
    ('profiles', 'id', 'uuid'), ('profiles', 'app_user_name', 'text'),
    ('couples', 'id', 'uuid'),
    ('couple_members', 'couple_id', 'uuid'), ('couple_members', 'user_id', 'uuid'),
    ('couple_state', 'id', 'text'), ('couple_state', 'state', 'jsonb'),
    ('couple_state', 'updated_at', 'timestamp with time zone'),
    ('push_subscriptions', 'id', 'uuid'), ('push_subscriptions', 'couple_id', 'text'),
    ('push_reminders', 'id', 'uuid'), ('push_reminders', 'couple_id', 'text'),
    ('push_reminders', 'reminder_key', 'text'),
    ('push_reminders', 'retry_count', 'integer'),
    ('push_reminders', 'delivered_endpoints', 'jsonb'),
    ('push_sync_log', 'user_name', 'text'),
    ('push_sync_log', 'last_sync_at', 'timestamp with time zone')
  ) AS required(table_name, column_name, type_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid = pg_catalog.to_regclass('public.' || expected.table_name)
        AND a.attname = expected.column_name AND NOT a.attisdropped
        AND pg_catalog.format_type(a.atttypid, a.atttypmod) = expected.type_name
    ) THEN
      RAISE EXCEPTION 'Missing or incompatible column: %.%', expected.table_name, expected.column_name;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid = 'public.couple_state'::regclass
      AND attname = 'couple_id' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'couple_state.couple_id now exists: re-review its type, binding and constraints';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname IN ('anon', 'authenticated') AND (rolsuper OR rolbypassrls)
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role' AND rolbypassrls
  ) THEN
    RAISE EXCEPTION 'Unexpected client/service role RLS configuration';
  END IF;
END
$preflight$;

-- Stabilize the verified household during checks, binding and policy replacement.
-- Missing tables still fail here; concurrent writes wait or the timeout aborts.
LOCK TABLE public.profiles, public.couples, public.couple_members,
  public.couple_state, public.push_subscriptions, public.push_reminders,
  public.push_sync_log IN SHARE ROW EXCLUSIVE MODE;

DO $identity$
DECLARE
  seval_id CONSTANT UUID := '426ec3c7-0354-4aea-99c9-688ca1baf610';
  mateo_id CONSTANT UUID := 'c74d2e29-99e9-4e10-8e7a-3a325932d2c6';
  household_id CONSTANT UUID := '3de918c1-fccc-454d-8618-8dce607ea4d8';
BEGIN
  -- Protect these Auth rows from deletion while this transaction is running.
  PERFORM id FROM auth.users WHERE id IN (seval_id, mateo_id) FOR KEY SHARE;
  IF (SELECT count(*) FROM auth.users
      WHERE id IN (seval_id, mateo_id) AND deleted_at IS NULL
        AND is_anonymous IS FALSE AND role = 'authenticated') <> 2 THEN
    RAISE EXCEPTION 'Verified partner Auth accounts do not match';
  END IF;

  -- Labels are checked only for migration consistency, never by RLS authorization.
  IF (SELECT count(*) FROM public.profiles
      WHERE (id = seval_id AND app_user_name = 'seval')
         OR (id = mateo_id AND app_user_name = 'mateo')) <> 2 THEN
    RAISE EXCEPTION 'Verified partner profiles do not match';
  END IF;
  IF (SELECT count(*) FROM public.couples WHERE id = household_id) <> 1
     OR (SELECT count(*) FROM public.couple_members WHERE couple_id = household_id) <> 2
     OR (SELECT count(*) FROM public.couple_members
         WHERE couple_id = household_id AND user_id IN (seval_id, mateo_id)) <> 2
     OR (SELECT count(*) FROM public.couple_members
         WHERE user_id IN (seval_id, mateo_id)) <> 2 THEN
    RAISE EXCEPTION 'Partners must belong only to the verified two-person household';
  END IF;

  IF (SELECT count(*) FROM public.couple_state) <> 1
     OR (SELECT count(*) FROM public.couple_state
         WHERE id = 'sema' AND jsonb_typeof(state) = 'object') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly the existing sema JSON object';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.couple_state'::regclass AND NOT tgisinternal
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class = 'public.couple_state'::regclass
  ) THEN
    RAISE EXCEPTION 'Unexpected shared-state triggers or rules require review';
  END IF;
END
$identity$;

-- Add the missing mapping without replacing the existing row or JSON.
ALTER TABLE public.couple_state ADD COLUMN couple_id UUID;
ALTER TABLE public.couple_state ADD CONSTRAINT couple_state_couple_id_fkey
  FOREIGN KEY (couple_id) REFERENCES public.couples(id) ON DELETE RESTRICT;
ALTER TABLE public.couple_state ADD CONSTRAINT couple_state_couple_id_key UNIQUE (couple_id);

DO $bind$
DECLARE
  original_state JSONB;
  original_updated_at TIMESTAMPTZ;
  affected BIGINT;
BEGIN
  SELECT state, updated_at INTO STRICT original_state, original_updated_at
  FROM public.couple_state WHERE id = 'sema';

  UPDATE public.couple_state
  SET couple_id = '3de918c1-fccc-454d-8618-8dce607ea4d8'::uuid
  WHERE id = 'sema' AND couple_id IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected <> 1 OR NOT EXISTS (
    SELECT 1 FROM public.couple_state
    WHERE id = 'sema' AND couple_id = '3de918c1-fccc-454d-8618-8dce607ea4d8'::uuid
      AND state IS NOT DISTINCT FROM original_state
      AND updated_at IS NOT DISTINCT FROM original_updated_at
  ) THEN
    RAISE EXCEPTION 'Binding failed or changed existing shared-state data';
  END IF;
END
$bind$;
ALTER TABLE public.couple_state ALTER COLUMN couple_id SET NOT NULL;

-- Replace all policies on these seven tables and remove table/column client ACLs.
-- No CASCADE: unexpected dependencies abort rather than removing other objects.
DO $access_cleanup$
DECLARE
  table_name TEXT;
  column_names TEXT;
  existing_policy RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'couples', 'couple_members', 'couple_state',
    'push_subscriptions', 'push_reminders', 'push_sync_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name
    );
    SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
    INTO column_names FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = pg_catalog.to_regclass('public.' || table_name)
      AND a.attnum > 0 AND NOT a.attisdropped;
    EXECUTE format(
      'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s)
       ON TABLE public.%2$I FROM PUBLIC, anon, authenticated',
      column_names, table_name
    );
    FOR existing_policy IN
      SELECT policyname FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = table_name
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', existing_policy.policyname, table_name);
    END LOOP;
  END LOOP;
END
$access_cleanup$;

-- Verified absent at preparation time. Fail if another private schema appeared.
CREATE SCHEMA private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

-- The definer is postgres; this narrow UUID lookup avoids recursive member RLS.
-- All referenced objects are qualified; callers cannot write membership.
CREATE FUNCTION private.is_couple_member(target_couple_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = '' AS $member$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.couple_members
    WHERE couple_id = target_couple_id AND user_id = (SELECT auth.uid())
  );
$member$;
REVOKE ALL ON FUNCTION private.is_couple_member(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.is_couple_member(UUID) TO authenticated;

-- The old public helper exists from the applied foundation. Preserve the object
-- for any server dependencies, but close its client-callable RPC entry point.
REVOKE ALL ON FUNCTION public.is_couple_member(UUID) FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.profiles, public.couples, public.couple_members,
  public.couple_state TO authenticated;
GRANT UPDATE (state, updated_at) ON public.couple_state TO authenticated;
CREATE POLICY "profiles: users read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
CREATE POLICY "couples: members read own couple" ON public.couples
  FOR SELECT TO authenticated USING (private.is_couple_member(id));
CREATE POLICY "couple_members: members read own couple membership" ON public.couple_members
  FOR SELECT TO authenticated USING (private.is_couple_member(couple_id));
CREATE POLICY "couple_state: members read" ON public.couple_state
  FOR SELECT TO authenticated USING (private.is_couple_member(couple_id));
CREATE POLICY "couple_state: members update" ON public.couple_state
  FOR UPDATE TO authenticated USING (private.is_couple_member(couple_id))
  WITH CHECK (private.is_couple_member(couple_id));

-- Explicit server DML access. UUID defaults need no sequence permissions.
-- No policies or grants permit client access to any push table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.couples,
  public.couple_members, public.couple_state, public.push_subscriptions,
  public.push_reminders, public.push_sync_log TO service_role;

-- Check effective access as well as direct ACLs (unexpected inheritance aborts).
DO $postconditions$
DECLARE
  table_name TEXT;
  client_role TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'profiles', 'couples', 'couple_members', 'couple_state',
    'push_subscriptions', 'push_reminders', 'push_sync_log'
  ] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_catalog.pg_class
            WHERE oid = pg_catalog.to_regclass('public.' || table_name)) THEN
      RAISE EXCEPTION 'RLS missing on %', table_name;
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(client_role, 'public.' || table_name,
           'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         OR has_any_column_privilege(client_role, 'public.' || table_name, 'INSERT,REFERENCES')
         OR has_table_privilege(client_role, 'public.' || table_name, 'UPDATE')
         OR (table_name <> 'couple_state' OR client_role = 'anon')
            AND has_any_column_privilege(client_role, 'public.' || table_name, 'UPDATE')
         OR (client_role = 'anon' OR table_name LIKE 'push_%')
            AND has_any_column_privilege(client_role, 'public.' || table_name, 'SELECT')
      THEN
        RAISE EXCEPTION 'Unexpected effective client privilege: % on %', client_role, table_name;
      END IF;
    END LOOP;
  END LOOP;
  IF has_column_privilege('authenticated', 'public.couple_state', 'id', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.couple_state', 'couple_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Clients must not reassign the shared-state identity';
  END IF;
END
$postconditions$;

-- Entire transaction rolls back on any mismatch. No Auth/profile/member/push
-- rows are inserted, removed or rewritten; only sema.couple_id is populated.
-- Storage, public photo URLs and migration history are outside this file's scope.
COMMIT;
