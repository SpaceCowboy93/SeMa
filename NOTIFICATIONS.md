# Notifications

SeMaCalendar uses two parallel notification systems that work together.

---

## 1. In-app notifications (`useNotifications`)

Fires browser `Notification` API directly from the tab using `setTimeout`.

**Sources tracked:**
- Calendar events (with `startTime`)
- Todos, Goals, Wishlist items (incomplete, with `startTime`)
- Countdowns (at `time` or 09:00 default)
- Weekly focus activities (with `time` + `reminder` set)

**Reminder schedule per item:**
| Trigger | When |
|---------|------|
| Previous day | 20:00 the evening before |
| 1 hour before | Exactly 60 min before start |
| 5 min before | Exactly 5 min before start |

Focus activities use a single custom offset instead (at time / 10 min / 30 min / 1 h before).

**Re-schedules on:** store state change, tab visibility change, permission grant.

**Limitation:** only fires while the browser tab is open.

---

## 2. Push notifications (`usePushNotifications`)

Server-side delivery via Web Push — fires even when the app is closed.

**Flow:**
1. Service worker `/sw.js` registers on every page load
2. User taps "Enable notifications" → `Notification.requestPermission()` → `PushManager.subscribe()`
3. Subscription saved to server via `POST /api/push/subscribe`
4. App calls `POST /api/push/sync-reminders` with all future-dated items for **both users**
5. Server schedules and delivers pushes at the same 3-tier times as in-app

**API routes:**
- `POST /api/push/subscribe` — save subscription
- `DELETE /api/push/subscribe` — remove subscription
- `GET /api/push/status?userName=` — check if server has subscription
- `POST /api/push/sync-reminders` — sync scheduled reminders
- `POST /api/push/process` — process and send pending pushes
- `POST /api/push/send` — send a push immediately

**Status states:** `default` → `granted` → `subscribed` | `denied` | `unsupported`

**Reconnect:** If a device subscription exists in PushManager but not on the server (e.g. after switching profiles), the UI shows a "Connect this device" option that re-saves the existing subscription without a new permission prompt.

---

## Relevant files

| File | Purpose |
|------|---------|
| `src/hooks/useNotifications.ts` | In-app setTimeout scheduling |
| `src/hooks/usePushNotifications.ts` | SW registration, push subscribe/unsubscribe, reminder sync |
| `src/components/NotificationSetup.tsx` | UI for enabling/disabling push notifications |
| `src/components/PartnerNoteNotification.tsx` | In-app banner for unread partner notes |
| `src/app/(app)/layout.tsx` | Mounts both hooks on every app page |
| `public/sw.js` | Service worker — receives and displays push events |
