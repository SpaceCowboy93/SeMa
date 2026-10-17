/**
 * Regression tests for EventModal → Goal.checklist sync (DEF-1 fix).
 *
 * Prior to the fix, EventModal.handleSave called:
 *   updateGoal(linkedGoalId, { startTime, notes })
 * and omitted `checklist`. Edited todos were saved on CalendarEvent.todos but
 * Goal.checklist was never updated, so the Dreams view and EventModal diverged.
 *
 * The fix adds: checklist: todos.map(t => t.title)
 *
 * These tests retain compatibility coverage for legacy callers using
 * updateEvent + updateGoal. The actual editor now uses one atomic updateEvent;
 * component behavior is covered in dream-calendar-editors.test.tsx.
 */

import { expect, it } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { generateId } from '@/lib/utils'
import type { EventTodo } from '@/types'

function fresh() {
  useAppStore.setState({
    currentUser: 'mateo',
    events: [],
    goals: [],
  } as never)
}

/**
 * Simulates the legacy two-action save for a goal-linked event.
 * Calls updateEvent (to persist todos on the event) then updateGoal
 * (to sync startTime, notes, and checklist back to the Goal).
 */
function saveFromModal(
  eventId: string,
  goalId: string,
  todoTitles: string[],
  opts: { startTime?: string; notes?: string } = {},
) {
  const { updateEvent, updateGoal } = useAppStore.getState()
  const todos: EventTodo[] = todoTitles.map(title => ({
    id: generateId(),
    title,
    isCompleted: false,
  }))
  updateEvent(eventId, { todos: todos.length ? todos : undefined })
  updateGoal(goalId, {
    startTime: opts.startTime || undefined,
    notes: opts.notes?.trim() || undefined,
    checklist: todos.map(t => t.title),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createDream(checklist?: string[]) {
  const { addGoal } = useAppStore.getState()
  return addGoal('life', 'Trip to Paris', undefined, '2027-06-01', 0, '14:00', checklist)
}

function linkedEvent(goalId: string) {
  const { events } = useAppStore.getState()
  return events.find(e => e.linkedGoalId === goalId)!
}

function goal(goalId: string) {
  return useAppStore.getState().goals.find(g => g.id === goalId)!
}

// ── 1. Adding checklist items through EventModal ──────────────────────────────

it('EventModal: adding todos syncs new checklist items to the linked Goal', () => {
  fresh()
  const goalId = createDream()
  const event  = linkedEvent(goalId)
  expect(event).toBeDefined()

  saveFromModal(event.id, goalId, ['Buy flights', 'Book hotel', 'Pack bags'])

  const g = goal(goalId)
  expect(g.checklist).toEqual(['Buy flights', 'Book hotel', 'Pack bags'])

  const ev = linkedEvent(goalId)
  expect(ev.todos!.map(t => t.title)).toEqual(['Buy flights', 'Book hotel', 'Pack bags'])
})

// ── 2. Renaming checklist items ───────────────────────────────────────────────

it('EventModal: renaming a todo item renames the corresponding Goal.checklist entry', () => {
  fresh()
  const goalId = createDream(['Old name', 'Stay the same'])
  const event  = linkedEvent(goalId)

  // Simulate user renamed "Old name" → "New name" in EventModal
  saveFromModal(event.id, goalId, ['New name', 'Stay the same'])

  const g = goal(goalId)
  expect(g.checklist).toEqual(['New name', 'Stay the same'])
})

// ── 3. Deleting checklist items ───────────────────────────────────────────────

it('EventModal: removing a todo item removes it from Goal.checklist', () => {
  fresh()
  const goalId = createDream(['Step 1', 'Step 2', 'Step 3'])
  const event  = linkedEvent(goalId)

  // Simulate user deleted "Step 2" in EventModal
  saveFromModal(event.id, goalId, ['Step 1', 'Step 3'])

  const g = goal(goalId)
  expect(g.checklist).toEqual(['Step 1', 'Step 3'])
  expect(g.checklist).not.toContain('Step 2')
})

// ── 4. Preserving item order ──────────────────────────────────────────────────

it('EventModal: reordering todos preserves order in Goal.checklist', () => {
  fresh()
  const goalId = createDream(['Alpha', 'Beta', 'Gamma'])
  const event  = linkedEvent(goalId)

  // Simulate user reordered to Gamma → Alpha → Beta
  saveFromModal(event.id, goalId, ['Gamma', 'Alpha', 'Beta'])

  const g = goal(goalId)
  expect(g.checklist).toEqual(['Gamma', 'Alpha', 'Beta'])

  const ev = linkedEvent(goalId)
  expect(ev.todos!.map(t => t.title)).toEqual(['Gamma', 'Alpha', 'Beta'])
})

// ── 5. Empty checklist synchronization ───────────────────────────────────────

it('EventModal: clearing all todos explicitly clears both checklists', () => {
  fresh()
  const goalId = createDream(['Remove me'])
  const event  = linkedEvent(goalId)

  saveFromModal(event.id, goalId, [])

  const g = goal(goalId)
  // updateGoal spreads checklist:[] onto the goal (empty array, not undefined)
  expect(g.checklist).toEqual([])

  // An explicit empty list prevents legacy fallback resurrection on reopen.
  const ev = linkedEvent(goalId)
  expect(ev.todos).toEqual([])
})

// ── 6. No goal modification for unlinked events ───────────────────────────────

it('EventModal: saving an unlinked event does not modify any Goal', () => {
  fresh()
  // Create a Goal (with its linked event) plus a separate unlinked event
  const goalId = createDream(['Original item'])
  const { addEvent } = useAppStore.getState()
  const unlinkedId = addEvent({
    title: 'Plain event',
    date: '2027-07-01',
    color: 'blue',
    createdBy: 'mateo',
  })

  // Simulate saving the unlinked event — no updateGoal call because linkedGoalId is undefined
  const { updateEvent } = useAppStore.getState()
  const todos: EventTodo[] = [{ id: generateId(), title: 'Unrelated todo', isCompleted: false }]
  updateEvent(unlinkedId, { todos })

  // Goal must be completely unchanged
  const g = goal(goalId)
  expect(g.checklist).toEqual(['Original item'])
})

// ── 7. Existing Dream → Calendar sync remains working ────────────────────────

it('Dream → Calendar direction: updateGoal with checklist still syncs todos to the linked event', () => {
  fresh()
  const goalId = createDream(['First', 'Second'])
  const event  = linkedEvent(goalId)

  // Verify creation sync
  expect(event.todos!.map(t => t.title)).toEqual(['First', 'Second'])

  // Update goal directly (CategoryHub / Goals page path)
  const { updateGoal } = useAppStore.getState()
  updateGoal(goalId, { checklist: ['First', 'Second', 'Third'] })

  const ev = linkedEvent(goalId)
  expect(ev.todos!.map(t => t.title)).toEqual(['First', 'Second', 'Third'])

  const g = goal(goalId)
  expect(g.checklist).toEqual(['First', 'Second', 'Third'])
})
