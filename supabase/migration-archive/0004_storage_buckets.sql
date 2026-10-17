-- =============================================================================
-- Migration 0004: Storage Bucket — event-photos
-- =============================================================================
-- STATUS: Apply via Supabase Dashboard SQL editor or `supabase db push`.
--
-- Purpose:
--   Create the "event-photos" storage bucket used by /api/upload-photo.
--   The bucket must exist AND be PUBLIC for getPublicUrl() to return
--   accessible image URLs in the browser.
--
-- The upload API route uses the service-role key (bypasses RLS entirely).
-- No storage RLS policies are needed for the upload path.
-- Public read access is granted by setting public = TRUE on the bucket.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-photos',
  'event-photos',
  TRUE,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = TRUE,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- Dashboard alternative (no SQL access):
--   Storage → Buckets → "New bucket"
--     Name:                event-photos
--     Public bucket:       ✅ checked
--     File size limit:     5 MB
--     Allowed MIME types:  image/jpeg, image/png, image/webp, image/heic, image/heif
-- =============================================================================

-- =============================================================================
-- Rollback:
--   DELETE FROM storage.buckets WHERE id = 'event-photos';
--   (Only safe when the bucket is empty. Remove objects first.)
-- =============================================================================
