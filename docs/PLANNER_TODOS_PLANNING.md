# Planner & To-Dos — Implementation Planning

*Branch: security/phase-1-auth-foundation · Drafted: 2026-10-01*

---

## 1. Current State

### `/planner` (Weekly Focus room)
The Planner page today is a **read-aggregation view**: it pulls from three independent data sources and presents them side-by-side without a unified timeline.

| Section | Source | Interaction |
|---------|--------|-------------|
| Weekly Focus | `WeeklyFocusSection` component (focus activities) | Create/edit activities inline |
| Upcoming dates | `countdowns[]` + `events[]`, sorted by `date` | Tap countdown → `AnniversarySheet`, tap event → `EventModal` |
| Needs attention | Overdue `todos`, active shopping lists | Tap → navigate to `/shopping` or opens `CategoryHubSheet('plans')` |

**Gaps:**
- No week grid — items are a flat sorted list, not mapped to days.
- `todos` surface only in "Needs attention" when overdue; they are not visible on their due date in the planner.
- No way to see all events for a specific day in the planner without going to `/calendar`.

### `/todos` (To-Dos room)
A standalone to-do list with flat pending/completed sections.

`SharedTodo` fields:
```ts
id, title, items[], notes, isCompleted, completedBy,
createdBy, createdAt, date?, startTime?, color?,
linkedEventId?, photos[], backgroundPhoto
```

`date` and `linkedEventId` exist but are **not used** to connect todos to the calendar grid or planner week view. The link to a CalendarEvent mirrors what Goals already do (same `linkedEventId` pattern).

---

## 2. Design Goals

1. **Single source of truth** — `todos[]` IS the to-do list. No duplication into `events[]` unless a due date+time is set (same Goal↔Calendar pattern).
2. **Week View** — The Planner shows a 7-day column grid. Each column shows events and dated todos for that day.
3. **Mutual sync** — When a todo gets a `date`, a linked CalendarEvent is created. Editing the event title/time updates the todo. Deleting the todo removes the event. Mirrors `addGoal`/`updateGoal` behaviour in `useAppStore.ts`.
4. **Minimal migration** — Todos without `date` stay exactly as-is on `/todos`. The week view is additive.

---

## 3. Implementation Plan

### Phase A — Todo ↔ Calendar sync (store-level)

Add three store actions mirroring the Goal sync pattern:

```ts
// useAppStore.ts — new actions alongside addTodo / updateTodo / deleteTodo

addTodoWithEvent(todo: Pick<SharedTodo, 'title'|'items'|'notes'|'date'|'startTime'|'color'>) {
  // 1. Create the SharedTodo
  // 2. If todo.date: createLinkedEvent({ title, date, startTime, linkedTodoId })
  // 3. Set todo.linkedEventId = newEvent.id
}

updateTodo(id, updates) {
  // Existing logic + new:
  // If updates.date changes → create/move/remove linked event (same as updateGoal)
  // If updates.title changes AND linkedEventId → update event title
  // If updates.items changes AND linkedEventId → update event todos
}

deleteTodo(id) {
  // Existing logic + new:
  // If todo.linkedEventId → also delete the linked event
}
```

**CalendarEvent needs one new optional field:**
```ts
linkedTodoId?: string   // mirrors linkedGoalId
```

The `EventModal.handleSave` should propagate changes back to the todo the same way it does for goals:
```ts
if (event.linkedTodoId) {
  updateTodo(event.linkedTodoId, {
    title: newTitle,
    items: todos.map(t => t.title),
    notes: newNotes,
  })
}
```

### Phase B — Planner Week View

Replace the flat "Upcoming dates" list with a week grid component.

**Component:** `src/components/planner/WeekGrid.tsx`

```
┌───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│  Mon  │  Tue  │  Wed  │  Thu  │  Fri  │  Sat  │  Sun  │
│  Oct 1│  Oct 2│  Oct 3│  Oct 4│  Oct 5│  Oct 6│  Oct 7│
├───────┼───────┼───────┼───────┼───────┼───────┼───────┤
│ ● Ev1 │       │ ● Ev2 │       │       │       │       │
│ □ Todo│       │       │       │ □ T2  │       │       │
└───────┴───────┴───────┴───────┴───────┴───────┴───────┘
```

Data derivation:
```ts
// Group events + dated todos by date
const byDay: Map<string, (CalendarEvent | SharedTodo)[]> = new Map()
events
  .filter(e => e.date >= weekStart && e.date <= weekEnd)
  .forEach(e => push(byDay, e.date, e))
todos
  .filter(t => t.date && t.date >= weekStart && t.date <= weekEnd)
  .forEach(t => push(byDay, t.date!, t))
```

Tapping an event → `EventModal`
Tapping a todo → `EditTodoModal`
Tapping an empty day cell → new todo/event create sheet

**Navigation:** chevron buttons for prev/next week; tap current week header → return to today.

### Phase C — `/todos` page integration

The `/todos` page keeps its flat list as the primary view. Add a date-view toggle:

```
[ List view ]  [ Calendar view ]
```

Calendar view shows a compact month grid (reusing the miniCal already in `/together`) with dot indicators per day where todos are due.

---

## 4. Migration Requirements

| Change | Backwards compatible? | Notes |
|--------|----------------------|-------|
| Add `linkedTodoId` to `CalendarEvent` | ✓ Optional field, ignored by existing code | |
| `updateTodo` syncs to event | ✓ No-op if no `linkedEventId` | |
| `deleteTodo` removes linked event | ✓ Guard: `if (todo.linkedEventId)` | |
| `EventModal` reads `linkedTodoId` | ✓ Falls through if undefined | |
| Planner week view replaces upcoming list | ✗ Removes existing upcoming-dates section | Keep as collapsed "later dates" fallback below the grid |
| Zustand persist key `semacalendar-v1` | ✓ New fields default to `undefined` | No hydration migration needed |

No Supabase schema changes required: `SharedState` already includes `todos[]` and `events[]` with open object shapes. The new fields (`linkedTodoId`) will sync transparently.

---

## 5. Test Requirements

All new sync behaviour must be unit-tested before shipping. Mirror the existing goal-event sync tests:

| File | Tests to add |
|------|-------------|
| `src/__tests__/store/todo-event-sync.test.ts` | addTodo with date creates linked event; updateTodo date change moves event; deleteTodo removes event; EventModal updates propagate back to todo |
| `src/__tests__/store/todo-event-hydration.test.ts` | Session-key guard prevents mid-edit wipe when Supabase syncs during EventModal open |

Target: ~15 new unit tests, matching the `goal-event-sync.test.ts` pattern.

---

## 6. Estimated Work

| Phase | Scope | Risk |
|-------|-------|------|
| A — Store sync | ~150 lines in `useAppStore.ts` + EventModal | Low — mirrors goal pattern exactly |
| B — WeekGrid component | ~200 lines new component | Medium — layout complexity |
| C — `/todos` calendar toggle | ~50 lines UI addition | Low |
| Tests | ~150 lines | Low |

Phase A is a prerequisite for B and C. B and C can be developed in parallel once A ships.

---

## 7. Open Questions

1. **Collision handling**: When a todo is created from the calendar (EventModal creates a `linkedTodoId` event), should a corresponding `SharedTodo` also be created, or is the event sufficient? Current answer: event-first creation does NOT auto-create a todo; todo-first creation with `date` creates an event.

2. **WeeklyFocusSection placement**: Currently renders above the week grid. Keep it above (motivational context) or move it to a tab alongside the grid?

3. **Completed todos in week view**: Show or hide completed todos in the grid? Suggested: hide by default, toggle with a small "show completed" chip.
