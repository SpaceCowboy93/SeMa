-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: activity_notifications
-- Created:   2026-10-08  (PREPARED — NOT YET APPLIED)
--
-- Status: ⚠️  DO NOT APPLY until Supabase HTTP 402 egress quota is resolved.
--            Apply manually via Supabase Dashboard → SQL Editor, or via
--            `supabase db push` once the project is accessible again.
--
-- Purpose:
--   Persistent server-side store for partner activity events.
--   Enables the Activity Centre to survive app reinstalls and device switches.
--
-- Security model:
--   - Row-level security (RLS) enforced on all tables.
--   - Each row is scoped to a couple_id; members of the couple may read rows
--     addressed to them as recipient.
--   - Actors may only insert rows where actor_id = auth.uid().
--   - No user may read another couple's data.
--   - Sensitive entity types (partnerNote, finance) store only the safe_body —
--     the raw entity title/content is never persisted here.
--
-- Tables created:
--   activity_events     — canonical event log (written by actor, read by recipient)
--
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enable UUID extension (already enabled on this project) ──────────────────

-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── activity_events ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activity_events (
  id               TEXT        PRIMARY KEY,          -- idempotency key (actor:type:action:entityId:minuteBucket)
  couple_id        UUID        NOT NULL
                               REFERENCES public.couples(id) ON DELETE CASCADE,
  actor_id         UUID        NOT NULL,             -- auth.uid() of the user who acted
  recipient_id     UUID        NOT NULL,             -- the other partner
  entity_type      TEXT        NOT NULL,             -- 'event' | 'todo' | 'goal' | ...
  action_type      TEXT        NOT NULL,             -- 'created' | 'completed' | ...
  entity_id        TEXT        NOT NULL,             -- ID of the affected entity
  entity_title     TEXT        NOT NULL DEFAULT '',  -- may be '[hidden]' for sensitive types
  importance       TEXT        NOT NULL DEFAULT 'feed_only',
  grouping_key     TEXT        NOT NULL DEFAULT '',
  deep_link        TEXT        NOT NULL DEFAULT '/together',
  safe_body        TEXT        NOT NULL DEFAULT '',  -- push/feed notification text (never raw content)
  group_count      INT         NOT NULL DEFAULT 1,
  is_read          BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast recipient inbox queries (most-recent first)
CREATE INDEX IF NOT EXISTS activity_events_recipient_created
  ON public.activity_events (couple_id, recipient_id, created_at DESC);

-- Index for idempotency deduplication checks
CREATE INDEX IF NOT EXISTS activity_events_actor_entity
  ON public.activity_events (actor_id, entity_id, action_type, created_at DESC);

-- ── Row-level security ────────────────────────────────────────────────────────

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

-- Recipients may read events addressed to them
CREATE POLICY "recipients can read their events"
  ON public.activity_events
  FOR SELECT
  USING (
    recipient_id = auth.uid()
    AND couple_id IN (
      SELECT couple_id FROM public.couple_members WHERE user_id = auth.uid()
    )
  );

-- Actors may insert events for their own couple where they are the actor
CREATE POLICY "actors can insert their own events"
  ON public.activity_events
  FOR INSERT
  WITH CHECK (
    actor_id = auth.uid()
    AND couple_id IN (
      SELECT couple_id FROM public.couple_members WHERE user_id = auth.uid()
    )
    -- Prevent self-notification: actor and recipient must differ
    AND actor_id <> recipient_id
  );

-- Recipients may mark events as read (UPDATE is_read only)
CREATE POLICY "recipients can mark events read"
  ON public.activity_events
  FOR UPDATE
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- No DELETE: events are immutable; pruning is handled by the cleanup function below

-- ── Retention cleanup function ────────────────────────────────────────────────
-- Deletes events older than 30 days and read events older than 7 days.
-- Call via pg_cron or from the /api/activity/cleanup endpoint.

CREATE OR REPLACE FUNCTION public.prune_old_activity_events()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.activity_events
  WHERE created_at < now() - INTERVAL '30 days'
     OR (is_read = true AND created_at < now() - INTERVAL '7 days');
$$;

-- ── Validation constraint: only known entity types ────────────────────────────

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_entity_type_check
  CHECK (entity_type IN (
    'event', 'todo', 'goal', 'wish', 'shopping', 'mood',
    'memory', 'loveNote', 'partnerNote', 'countdown', 'finance', 'focus'
  ));

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_action_type_check
  CHECK (action_type IN (
    'created', 'completed', 'achieved', 'deleted', 'shared', 'sent', 'added', 'updated'
  ));

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_importance_check
  CHECK (importance IN ('immediate', 'grouped', 'feed_only'));

-- ── Comments ──────────────────────────────────────────────────────────────────

COMMENT ON TABLE  public.activity_events                    IS 'Partner activity notification event log. RLS enforced.';
COMMENT ON COLUMN public.activity_events.id                 IS 'Idempotency key: {type}:{action}:{entityId}:{actor}:{minuteBucket}';
COMMENT ON COLUMN public.activity_events.safe_body          IS 'Push/feed notification text. Never contains raw sensitive content.';
COMMENT ON COLUMN public.activity_events.entity_title       IS 'Display title. Set to [hidden] for sensitive types unless sensitivePreview is enabled.';
COMMENT ON COLUMN public.activity_events.group_count        IS 'Accumulated count for grouped importance events (e.g. 4 shopping items added).';
