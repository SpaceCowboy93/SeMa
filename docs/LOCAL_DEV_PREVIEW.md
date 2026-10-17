# Local Dev Preview

A development-only offline UI preview for SeMa. Navigate the entire interface
with realistic fake data — no Supabase account, network access, or authentication
required.

---

## Accessing the preview

Start the dev server and open:

```
http://localhost:3000/dev-preview
```

Pick a fake identity (Mateo or Seval), then explore all screens via the preview
nav bar at the bottom.

> The route returns **404** in any non-development environment.
> It is completely inaccessible in production and Vercel Preview deployments.

---

## Key guarantees

| Guarantee | How it is enforced |
|-----------|-------------------|
| Dev-only access | Server layout calls `notFound()` when `NODE_ENV !== 'development'` |
| Zero Supabase calls | Preview layout does not mount `useSupabaseSync`, `useAuthSession`, `useNotifications`, or `usePushNotifications` |
| Isolated storage | All reads/writes use key `semacalendar-dev-preview-v1`; real couple-scoped keys (`semacalendar-v2:*`) are never touched |
| No real identities | Fake display names only — no real email addresses, UUIDs, or auth tokens in fixtures |
| Production auth unchanged | `/` (landing page) retains its full email + password sign-in flow |

---

## Navigation

The preview uses a custom bottom nav whose links all start with `/dev-preview/`:

| Label | Preview route | Mirrors real route |
|-------|--------------|-------------------|
| Home | `/dev-preview/together` | `/together` |
| Planner | `/dev-preview/planner` | `/planner` |
| Finances | `/dev-preview/plans` | `/plans` |
| Shopping | `/dev-preview/shopping` | `/shopping` |
| Us | `/dev-preview/us` | `/us` |

Direct-access routes (Goals, Todos, Wishlist) also exist:

- `/dev-preview/goals`
- `/dev-preview/todos`
- `/dev-preview/wishlist`

---

## Fixture data

All fixture IDs are prefixed `dp-` and are entirely synthetic. The fixtures
cover all 18 shared-state keys:

| Category | Count | Notes |
|----------|-------|-------|
| Calendar events | 6 | Past, today, upcoming; one linked to a goal |
| Todos | 5 | Steps, notes, due dates, one completed, one long title |
| Moods | 6 | Both users, multiple days |
| Love notes | 2 | One pinned |
| Wishlist items | 4 | One completed |
| Countdowns | 2 | With checklist entries |
| Memories | 2 | With categories and checklists |
| Goals | 4 | One linked to event, one completed, progress bars |
| Partner notes | 3 | One unread from Seval to Mateo |
| Shopping lists | 3 | 2 active with prices, 1 completed |
| Focus activities | 3 | Checklist, priorities, reminders; one completed |
| Budget items | 8 | Planned and actual amounts |
| Savings goals | 2 | With deadline and amounts |
| Savings transactions | 3 | Linked to savings goals |
| Finance months | 1 | Current month |
| Monthly income | — | 3500 |
| Focus carry-over | — | false |
| Boom-boom count | — | 42 |

---

## Persistence

The preview persists your edits (adding events, checking todos, etc.) to
`semacalendar-dev-preview-v1` in `localStorage`. When you return to
`/dev-preview`, your last session continues automatically.

To restore the default fixtures, click **Reset to default fixtures** on the
`/dev-preview` identity picker page.

---

## Relevant files

| File | Purpose |
|------|---------|
| `src/lib/dev-preview-fixtures.ts` | Guard, cache helpers, all fixture data |
| `src/app/dev-preview/layout.tsx` | Server component guard (`notFound` in non-dev) |
| `src/app/dev-preview/_shell.tsx` | Client shell: banner, custom nav, store seeding |
| `src/app/dev-preview/page.tsx` | Identity picker + reset button |
| `src/app/dev-preview/*/page.tsx` | Thin re-exports of real `(app)` page components |
| `src/__tests__/dev-preview/preview-isolation.test.tsx` | 12 regression tests |

---

## Architecture notes

### Why a separate layout?

The real `/(app)/layout.tsx` mounts four network hooks on every render:
`useSupabaseSync`, `useAuthSession`, `useNotifications`, `usePushNotifications`.
A separate layout at `src/app/dev-preview/layout.tsx` lets the preview render
none of these, guaranteeing zero network calls.

### Store seeding

The Zustand store uses `coupleStorage` (scoped to a couple ID). Because the
preview never calls `setCacheScope`, the scope is `null` — `getItem` returns
`null` and `setItem` is a no-op. This means the real couple cache is
untouched. The shell seeds the store manually via `useAppStore.setState()` and
subscribes to changes to persist shared state to the isolated preview key.

### Sub-page re-exports

Page components under `/(app)` read only from the Zustand store (they contain
no Supabase calls). Re-exporting them verbatim under `/dev-preview/*/page.tsx`
gives an authentic preview of every screen. Any navigation actions (modals,
router.push) use the real Next.js router; the developer may navigate away, but
returning to `/dev-preview` restores the session from saved preview state.
