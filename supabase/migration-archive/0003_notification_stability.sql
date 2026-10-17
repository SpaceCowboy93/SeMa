-- =============================================================================
-- Migration 0003: Notification Stability (Stage 1)
-- =============================================================================
-- STATUS: Ready for review. Do NOT apply to production until approved.
-- Purpose: Add reminder identity (reminder_key), delivery tracking columns,
--          a partial-unique index for idempotency, and a rate-limit log table.
-- =============================================================================

-- ── 1. push_reminders: add reminder_key ──────────────────────────────────────
--
-- reminder_key format:  {user_name}:{item_type}:{item_id}:{offset_label}
-- Examples:
--   mateo:event:abc-123:prev_day_8pm
--   seval:todo:def-456:1h_before
--   mateo:focus:ghi-789:10min
--   seval:finance-month-end:2026-07:fire
--
-- Nullable initially so existing rows are unaffected (nulls are excluded from
-- the partial unique index below). New code always supplies reminder_key.
-- A later migration can add NOT NULL once all legacy rows are gone.

ALTER TABLE push_reminders
  ADD COLUMN IF NOT EXISTS reminder_key TEXT;

-- Partial unique index: only enforces uniqueness for non-null reminder_key.
-- This allows old null-keyed rows to coexist safely during the transition.
CREATE UNIQUE INDEX IF NOT EXISTS push_reminders_reminder_key_uidx
  ON push_reminders (reminder_key)
  WHERE reminder_key IS NOT NULL;

-- ── 2. push_reminders: delivery tracking columns ─────────────────────────────
--
-- retry_count          — how many cron runs have attempted this reminder
-- last_error           — last non-stale delivery error (truncated, no secrets)
-- failed_permanently_at — set when retry_count reaches MAX_RETRIES (5)
--                         cron skips these rows forever
-- delivered_endpoints  — JSONB array of subscription endpoints that have already
--                         received this specific reminder successfully.
--                         The cron process route skips endpoints already in this list,
--                         enabling true per-subscription delivery tracking.
--                         Reset to [] by sync-reminders on every sync (fire_at may change).
--
-- Example: ["https://fcm.googleapis.com/...", "https://web.push.apple.com/..."]

ALTER TABLE push_reminders
  ADD COLUMN IF NOT EXISTS retry_count           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error            TEXT,
  ADD COLUMN IF NOT EXISTS failed_permanently_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_endpoints   JSONB       NOT NULL DEFAULT '[]';

-- ── 3. push_reminders: performance indexes ───────────────────────────────────
--
-- The cron query filters on (fire_at, sent_at, failed_permanently_at).
-- Without an index this is a full table scan on every cron run.

CREATE INDEX IF NOT EXISTS push_reminders_due_idx
  ON push_reminders (fire_at, sent_at)
  WHERE sent_at IS NULL AND failed_permanently_at IS NULL;

CREATE INDEX IF NOT EXISTS push_reminders_user_idx
  ON push_reminders (user_name);

-- ── 4. push_sync_log: per-user rate-limit tracker ───────────────────────────
--
-- One row per user. Updated (upserted) at the start of every sync request.
-- The sync-reminders route reads last_sync_at and returns 429 if elapsed < 3s.

CREATE TABLE IF NOT EXISTS push_sync_log (
  user_name    TEXT        PRIMARY KEY,
  last_sync_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Rollback (run manually if needed):
-- =============================================================================
--
-- DROP TABLE IF EXISTS push_sync_log;
-- DROP INDEX IF EXISTS push_reminders_user_idx;
-- DROP INDEX IF EXISTS push_reminders_due_idx;
-- ALTER TABLE push_reminders
--   DROP COLUMN IF EXISTS failed_permanently_at,
--   DROP COLUMN IF EXISTS last_error,
--   DROP COLUMN IF EXISTS retry_count;
-- DROP INDEX IF EXISTS push_reminders_reminder_key_uidx;
-- ALTER TABLE push_reminders
--   DROP COLUMN IF EXISTS reminder_key,
--   DROP COLUMN IF EXISTS delivered_endpoints;
