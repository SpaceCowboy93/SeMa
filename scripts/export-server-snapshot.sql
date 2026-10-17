-- PREPARED ONLY. Read-only export; run manually in the verified production project's SQL editor.
-- Keep both original devices offline. Download the ONE result as JSON to private storage.
-- Contains personal records. Do not paste results into chat, Git, logs or a public artifact.
-- This is a shared-row backup, not an Auth, Storage-object or whole-project backup.
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_build_object(
  'format', 'sema-server-state-export',
  'version', 1,
  'project_ref', 'neyhoodxeumpbxekskej',
  'captured_at', statement_timestamp(),
  'id', id,
  'couple_id', couple_id,
  'updated_at', updated_at,
  'state_jsonb_text', state::text,
  'state_md5', md5(state::text)
) AS snapshot
FROM public.couple_state
WHERE id = 'sema'
  AND couple_id = '3de918c1-fccc-454d-8618-8dce607ea4d8'::uuid;
COMMIT;
