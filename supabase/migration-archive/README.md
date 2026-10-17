# Archived migration drafts

These original SQL files are preserved outside `supabase/migrations` so Supabase
does not schedule them for replay:

- `0003_notification_stability.sql`
- `0004_storage_buckets.sql`

Neither version is recorded in the remote migration history. They are not copies
of the two recorded auth migrations and have not been marked applied. Their
earlier effects must not be replayed as part of the household access rollout;
in particular, 0004 can change live Storage bucket settings.

The active migration directory contains the two auth migrations reconstructed
from their recorded remote SQL, followed by the household binding migration
applied with explicit user approval on 2026-09-24. Supabase recorded it as
`20260924152904`; its local filename matches that version. No earlier remote
history entry was modified and neither archived script was replayed.

This history is reconciled for the existing project. It is not a complete
bootstrap history for an empty database; original base-table creation and
unrecorded historical changes remain outside the active chain.
