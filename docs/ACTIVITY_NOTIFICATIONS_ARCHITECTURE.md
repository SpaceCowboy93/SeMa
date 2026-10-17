# Activity Notifications — Architecture

**Branch:** `security/phase-1-auth-foundation`
**Date:** 2026-10-08
**Status:** Foundation built locally; live delivery disabled pending Supabase restore

---

## 1. Audit of the Existing Notification System

### 1.1 `useNotifications` (`src/hooks/useNotifications.ts`)

**What it does:**
Purely local scheduled-reminder system using browser `setTimeout`. Fires a `Notification` object at three standard offsets (previous day 8 PM, -1 h, -5 min) for every timed CalendarEvent, SharedTodo, Goal, WishlistItem and Countdown. A separate path handles FocusActivity entries which carry explicit `reminderOffset` values (`at_time`, `10min`, `30min`, `1h`).

**What it cannot do:**
- Does not reach Supabase.
- Does not notify the *partner* — it only notifies the *current device*.
- Does not group or deduplicate related actions.
- Contains no activity-event concept, no feed concept and no priority system.

**Reuse plan:** Keep unchanged. Scheduled reminders and activity notifications are completely separate responsibilities and must remain so.

---

### 1.2 `usePushNotifications` (`src/hooks/usePushNotifications.ts`)

**What it does:**
Manages Web Push subscription lifecycle for the authenticated user. Key operations:
- `enable()` — requests permission, calls `PushManager.subscribe()`, POSTs to `/api/push/subscribe`
- `disable()` — unsubscribes and DELETEs from server
- `reconnect()` — re-saves an existing `PushManager` subscription under the correct user
- `syncReminders(userName)` — sends the full set of future-dated items (via `collectDatedItems`) to `/api/push/sync-reminders` so the server-side `push_reminders` table stays in sync
- `syncBothUsers()` — calls `syncReminders` for both Mateo and Seval so shared events reach both devices

**Auth safety:**
- All server calls go through `authenticatedFetch` which injects the session Bearer token.
- `isCurrentAuth(context)` guards every async checkpoint; stale callbacks are discarded.
- The service worker's `pushsubscriptionchange` event signals the page to reconnect — no silent token refresh.

**What it cannot do:**
- Only manages *scheduled* reminder delivery via `push_reminders`. Has no mechanism to send an immediate notification when a partner performs an action.

**Reuse plan:** Keep unchanged. The subscription record it creates (`push_subscriptions` table, valid VAPID-encrypted endpoints) can be reused by the future activity-notification delivery route.

---

### 1.3 Service Worker (`public/sw.js`)

**What it does:**
Handles the `push` event (shows notification), `notificationclick` (opens `data.url` in an existing window or new tab), and `pushsubscriptionchange` (signals all open windows to reconnect). Clears old identity data (`sema-sw-identity`) via `CLEAR_USER` message for security.

**Deep-link gap:** The `notificationclick` handler opens `event.notification.data?.url ?? '/'`. The activity-notification system will use this mechanism but must allowlist valid internal paths before setting `data.url`.

**Reuse plan:** The service worker can deliver activity notifications unchanged — the payload structure (`title`, `body`, `url`, `tag`) is already generic.

---

### 1.4 Push API Routes

| Route | Purpose | Used by activity? |
|-------|---------|------------------|
| `/api/push/subscribe` | Save / delete push subscription | Reuse (subscription storage) |
| `/api/push/status` | Check if device is registered | Reuse |
| `/api/push/sync-reminders` | Upsert `push_reminders` rows | Separate — scheduled only |
| `/api/push/process` | Cron: deliver due reminders | Separate — scheduled only |
| `/api/push/send` | One-off push to one user | Future: delivery route wraps this |
| `/api/push/test` | Dev test push | Separate |
| `/api/push/finance-month-end` | Cron: finance reminder | Separate |

**New route needed:** `/api/activity` — accepts an idempotent activity event, verifies actor, resolves recipient via `couple_members`, applies preferences and quiet hours, inserts an `activity_events` row, then calls the push delivery layer. Currently stubbed as a 503 until the schema is applied.

---

### 1.5 Database — Applied Migrations (VERIFIED)

| File | Applied | Key tables |
|------|---------|-----------|
| `20260917202204_auth_foundation.sql` | Yes | `profiles`, `couples`, `couple_members` |
| `20260917202240_auth_foundation_restrict_membership_function.sql` | Yes | `is_couple_member()` function |
| `20260924152904_bind_sema_and_enforce_member_access.sql` | Yes | Foreign keys, RLS, binds existing data |

**Additional tables confirmed existing (from comment in migration 0005):**
`couple_state`, `push_subscriptions`, `push_reminders` (with `delivered_endpoints` JSONB), `push_sync_log`

**ASSUMPTION (unverified, cannot confirm while Supabase is offline):** The `push_reminders` table uses `couple_id TEXT` (not UUID) and `reminder_key TEXT`. The prepared activity migration uses UUIDs and a separate table.

---

### 1.6 `push_subscriptions` — Reusable for Activity Delivery

The existing table stores `couple_id TEXT`, `user_name TEXT`, `endpoint`, `p256dh`, `auth`. Once the server-side activity route is active it can read these rows to deliver push notifications — no schema change needed for subscription storage.

---

### 1.7 Security Controls Already in Place

- `withCoupleAuth` middleware validates the session JWT and resolves `CoupleAccess` before any push route handler runs.
- `assertOwnUser()` prevents a user from claiming subscriptions under another name.
- `validateEndpoint()` allowlists push endpoints to FCM, Mozilla, Apple and Windows domains only.
- `requireRecipient()` verifies the recipient name is a verified couple member — prevents cross-couple targeting.
- `isCurrentAuth(context)` guards every async checkpoint in `usePushNotifications`.
- Logout clears the auth session; `useAuthSession` detects sign-out and redirects to `/`.

---

### 1.8 Mutation Points That Can Generate Activity Notifications

| Store action | Entity type | Importance | Notes |
|-------------|------------|-----------|-------|
| `addEvent` | event | immediate | Only original user action |
| `deleteEvent` | event | immediate | Cancellation notification |
| `addTodo` | todo | immediate | New planner task |
| `toggleTodo` (→completed) | todo | immediate | Partner completion event |
| `sendPartnerNote` | partnerNote | immediate | Highest priority; sensitive content |
| `addLoveNote` | loveNote | immediate | Sensitive content |
| `setMood` | mood | immediate | Mood share |
| `addGoal` | goal | immediate | New dream |
| `updateGoal` (→isCompleted) | goal | immediate | Dream achieved |
| `addWishlistItem` | wish | immediate | New wish |
| `toggleWishlistItem` | wish | immediate | Wish fulfilled |
| `addMemory` | memory | immediate | New memory |
| `updateShoppingList` (→isCompleted) | shopping | immediate | Trip completed |
| `addShoppingItem` (bulk) | shopping | grouped | Individual items grouped |
| `addCountdown` | countdown | immediate | New countdown |
| `toggleFocusActivity` (→completed) | focus | feed_only | Routine |
| `addFocusActivity` | focus | feed_only | Routine |
| `setMonthlyIncome` | finance | feed_only | Amounts hidden by default |
| `addSavingsTransaction` | finance | grouped | |
| `updateBudgetItem` | finance | feed_only | Minor edit |
| `incrementBoomBoom` | — | feed_only | Relationship milestone |

**Must NOT generate events:**
- `updateEvent`, `updateTodo`, `updateGoal` (minor edit) → feed_only at most
- `uploadEventPhoto`, `uploadTodoPhoto`, etc. → feed_only
- Any action triggered by `useSupabaseSync.pull()` (remote apply)
- Any action triggered by `sync-merge.ts` (three-way merge)
- Any action triggered by `persist.rehydrate()` (local cache restore)

---

### 1.9 What Remains Separate

- `useNotifications` — local timer-based scheduled reminders → unchanged
- `usePushNotifications` + `push_reminders` table → scheduled push delivery → unchanged
- `/api/push/sync-reminders` and `/api/push/process` → cron-driven → unchanged

Activity notifications use their own table, route, and delivery path. No shared state.

---

## 2. New System Components

### 2.1 Typed Event Catalogue (`src/lib/activity-event.ts`)

Central source of truth for:
- `ActivityEntityType` (13 entity categories)
- `ActivityActionType` (8 action verbs)
- `ActivityImportance` (immediate | grouped | feed_only)
- `ActivityEvent` — what the actor produces
- `ActivityEntry` — what the recipient sees in their Activity Centre
- `ACTIVITY_CATALOGUE` — importance and deep-link mapping per (entity, action)
- Factory functions: `createActivityEvent()`, `buildSafePayload()`
- Deep-link resolver with allowlist validation

### 2.2 Local Outbox (`src/lib/activity-outbox.ts`)

User-scoped localStorage key: `semacalendar-activity-outbox-v1:{userId}`

Responsibilities:
- Queue new activity events with bounded retry backoff
- Deduplicate by idempotency key (prevents double-queue on rapid re-render)
- Group related events within a 5-minute window (shopping items, checklist edits)
- Expire entries older than 24 hours or queue size > 100
- Reject malformed records silently

The outbox is separate from `couple_state`. Logout wipes the outbox for the signed-out user.

### 2.3 Notification Preferences (`src/lib/notification-preferences.ts`)

User-scoped. Persisted via `src/lib/user-cache.ts` (key: `semacalendar-notif-prefs-v1:{userId}`).

Per-category toggles, global on/off, quiet hours (start/end hour), push vs. feed separation, sensitive-preview opt-in. Default: feed enabled; push disabled until permission granted; sensitive previews off.

### 2.4 Activity Centre (`src/components/ActivityCentre.tsx`)

- `ActivityBell` — compact bell button with unread badge (mounted in both real and dev-preview layout)
- `ActivityCentreSheet` — bottom sheet showing Activity Centre feed

Features: most recent first, actor emoji + safe text, relative time, entity colour chip, read/unread state, mark-one-read, mark-all-read, clear-read, deep-link navigation, empty state, 50-entry limit, reduced-motion support.

### 2.5 Store Additions (`src/store/useAppStore.ts`)

Added to `AppState` (NOT in `SHARED_KEYS` — user-scoped, not couple-synced):
- `activityEntries: ActivityEntry[]`
- `notificationPrefs: NotificationPreferences`
- CRUD actions for both

### 2.6 User Cache (`src/lib/user-cache.ts`)

User-scoped localStorage helpers for `activityEntries` and `notificationPrefs`.

### 2.7 Prepared Migration (`supabase/migrations/20261008120000_activity_notifications.sql`)

PREPARED ONLY — not applied. Contains:
- `activity_events` table (UUIDs, couple_id UUID FK, idempotency key unique constraint, RLS)
- `activity_notification_prefs` table (per-user, per-couple, per-category preferences)
- `activity_delivery_log` table (per-endpoint delivery tracking)
- Helper functions with fixed `search_path`
- Policies: recipient reads/updates own entries; server-role insert only
- Rollback section

### 2.8 API Stub (`src/app/api/activity/route.ts`)

Returns HTTP 503 with `{ error: 'Activity notifications not yet active', code: 'MIGRATION_PENDING' }` until the migration is applied and the feature flag is enabled.

---

## 3. Privacy and Behaviour Rules

| Rule | Implementation |
|------|---------------|
| Actor never notified | `actor !== recipient` enforced in `createActivityEvent()` |
| Only verified partner | Server: `requireRecipient()` checks `couple_members`; client: `OTHER_USER[actor]` |
| Hydration/sync never creates events | Gate in store actions: only original user actions enter outbox |
| Stable idempotency key | `{entityType}:{actionType}:{entityId}:{actor}:{minuteBucket}` |
| Retrying does not duplicate | Outbox dedup by idempotency key; server: unique constraint on `idempotency_key` |
| Partner Note body hidden | `buildSafePayload()` returns generic text for `partnerNote` by default |
| Finance amounts hidden | `buildSafePayload()` redacts amounts unless `sensitivePreview` is enabled |
| Allowlisted deep links | `resolveDeepLink()` validates against `SEMA_ALLOWED_PATHS` constant |
| Quiet hours | Push suppressed; Activity feed entry still created |
| Permission denial | App item saves normally; no activity event created or lost |
| Logout cleanup | `clearOutbox(userId)` called on sign-out |

---

## 4. What Works Now in `/dev-preview`

- Activity Centre bell visible in the layout with unread count badge
- Full Activity Centre sheet with all 8 fixture notifications
- Mark one read, mark all read, clear read entries
- Deep-link navigation (navigates within dev-preview via the preview nav)
- Notification preferences UI (category toggles, quiet hours, sensitive preview, push on/off)
- All preference changes are reactive and persisted to user-scoped localStorage

---

## 5. What Remains Disabled

- Actual event generation when store actions fire (call sites are documented but not wired in — adding them requires server delivery to be active first to avoid orphaned outbox entries)
- Outbox flush to server (requires migration applied + `/api/activity` active)
- Push delivery for activity events (requires migration applied)
- Real-time delivery to partner (requires Supabase Realtime on `activity_events`)

---

## 6. Rollout Plan (for when Supabase is restored)

1. Mateo reviews and applies `20261008120000_activity_notifications.sql`
2. Set `ACTIVITY_NOTIFICATIONS_ENABLED=true` in Vercel env
3. Update `/api/activity/route.ts` to call full implementation
4. Wire `enqueueActivityEvent()` into the store actions listed in §1.8
5. Test with Samsung S24 (see §7 below)

---

## 7. Manual Samsung S24 Test Plan

Run after Supabase is restored and migration applied:

```
1. Sign in as Mateo on Samsung S24 in Chrome
2. Sign in as Seval on a second device (or browser)
3. Enable push notifications on both devices (Settings → Notifications)
4. Mateo creates a calendar event → verify Seval receives:
   a. In-app Activity Centre entry (bell badge increments)
   b. Phone push notification ("Mateo added an event")
5. Seval sends a Partner Note → verify Mateo receives:
   a. Lock-screen notification: "You received a note in SeMa." (no content)
   b. Activity Centre entry with note indicator (not content)
6. Mateo completes a shopping list → verify Seval receives immediate push
7. Mateo adds 4 shopping items rapidly → verify only ONE grouped notification:
   "Mateo added 4 items to Shopping"
8. Enable quiet hours 22:00–07:00, trigger action at 23:00 → verify:
   a. NO push notification delivered
   b. Activity feed entry IS created
9. Disable Finance category in preferences → trigger finance action → verify:
   a. No push, no feed entry
10. Sign out Mateo → verify no Mateo outbox events arrive after sign-out
11. Reconnect Seval on a new device → verify old activity history loads
```
