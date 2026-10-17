/**
 * Regression tests for DEF-2: unlinked CalendarEvent optional fields
 * (notes, todos, startTime, endTime, color, photos) are lost after
 * EventModal.handleSave → updateEvent → reopen.
 *
 * These tests simulate what EventModal.handleSave does for UNLINKED events:
 *   updateEvent(event.id, data)
 * where `data` mirrors the exact shape handleSave constructs, including
 * explicit `undefined` values for unset optional fields.
 *
 * Each test reads the event back from the store and asserts the saved
 * fields are present, simulating what the modal's useEffect would read
 * when the event is reopened.
 */

import { expect, it, describe } from 'vitest'
import { useAppStore } from '@/store/useAppStore'
import { generateId } from '@/lib/utils'
import type { EventTodo } from '@/types'

function fresh() {
  useAppStore.setState({
    currentUser: 'mateo',
    events: [],
    goals: [],
    todos: [],
  } as never)
}

/** Mirrors the exact `data` object that EventModal.handleSave constructs. */
function makeSaveData(overrides: {
  title?: string
  date?: string
  startTime?: string
  endTime?: string
  notes?: string
  color?: 'seval' | 'blue' | 'yellow' | 'green'
  todos?: EventTodo[]
  photos?: string[]
  backgroundPhoto?: string
  createdBy?: 'mateo' | 'seval'
}) {
  return {
    title: (overrides.title ?? 'Test Event').trim(),
    date: overrides.date ?? '2027-03-15',
    startTime: overrides.startTime || undefined,
    endTime: overrides.endTime || undefined,
    notes: overrides.notes?.trim() || undefined,
    color: overrides.color ?? ('yellow' as const),
    todos: overrides.todos,
    photos: overrides.photos?.length ? overrides.photos : undefined,
    backgroundPhoto: overrides.backgroundPhoto ?? undefined,
    createdBy: (overrides.createdBy ?? 'mateo') as 'mateo' | 'seval',
  }
}

function createEvent(overrides?: Parameters<typeof makeSaveData>[0]) {
  const { addEvent } = useAppStore.getState()
  return addEvent(makeSaveData(overrides ?? {}))
}

function getEvent(id: string) {
  return useAppStore.getState().events.find(e => e.id === id)!
}

// ── 1. notes field ────────────────────────────────────────────────────────────

describe('unlinked event: notes field', () => {
  it('updateEvent sets notes on an event that had none', () => {
    fresh()
    const id = createEvent()
    expect(getEvent(id).notes).toBeUndefined()

    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ notes: 'Our anniversary dinner plans' }))

    expect(getEvent(id).notes).toBe('Our anniversary dinner plans')
  })

  it('updateEvent replaces existing notes', () => {
    fresh()
    const id = createEvent({ notes: 'Old notes' })
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ notes: 'Updated notes text' }))
    expect(getEvent(id).notes).toBe('Updated notes text')
  })

  it('updateEvent clears notes when empty string is passed (trim → undefined)', () => {
    fresh()
    const id = createEvent({ notes: 'Some notes' })
    const { updateEvent } = useAppStore.getState()
    // Empty/whitespace → notes: undefined (same as handleSave does)
    updateEvent(id, makeSaveData({ notes: '' }))
    expect(getEvent(id).notes).toBeUndefined()
  })
})

// ── 2. todos (EventTodo[]) ────────────────────────────────────────────────────

describe('unlinked event: todos field', () => {
  it('updateEvent sets todos on an event that had none', () => {
    fresh()
    const id = createEvent()
    expect(getEvent(id).todos).toBeUndefined()

    const todos: EventTodo[] = [
      { id: generateId(), title: 'Pack bags', isCompleted: false },
      { id: generateId(), title: 'Book hotel', isCompleted: false },
    ]
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ todos }))

    const saved = getEvent(id)
    expect(saved.todos).toHaveLength(2)
    expect(saved.todos!.map(t => t.title)).toEqual(['Pack bags', 'Book hotel'])
  })

  it('updateEvent preserves todo isCompleted state', () => {
    fresh()
    const id = createEvent()
    const todos: EventTodo[] = [
      { id: generateId(), title: 'Done item', isCompleted: true },
      { id: generateId(), title: 'Pending item', isCompleted: false },
    ]
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ todos }))

    const saved = getEvent(id)
    expect(saved.todos![0].isCompleted).toBe(true)
    expect(saved.todos![1].isCompleted).toBe(false)
  })

  it('updateEvent replaces existing todos with new list', () => {
    fresh()
    const oldTodos: EventTodo[] = [
      { id: generateId(), title: 'Old item 1', isCompleted: false },
      { id: generateId(), title: 'Old item 2', isCompleted: false },
    ]
    const id = createEvent({ todos: oldTodos })
    expect(getEvent(id).todos).toHaveLength(2)

    const newTodos: EventTodo[] = [
      { id: generateId(), title: 'New item', isCompleted: false },
    ]
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ todos: newTodos }))

    const saved = getEvent(id)
    expect(saved.todos).toHaveLength(1)
    expect(saved.todos![0].title).toBe('New item')
  })

  it('updateEvent clears todos when an explicit empty list is passed', () => {
    fresh()
    const todos: EventTodo[] = [{ id: generateId(), title: 'Remove me', isCompleted: false }]
    const id = createEvent({ todos })
    const { updateEvent } = useAppStore.getState()
    // Empty lists are explicit clears; omitted lists preserve existing items.
    updateEvent(id, makeSaveData({ todos: [] }))
    expect(getEvent(id).todos).toEqual([])
  })
})

// ── 3. notes + todos together (the reported defect scenario) ──────────────────

describe('unlinked event: notes + todos together (DEF-2 scenario)', () => {
  it('updateEvent preserves both notes and todos when set together', () => {
    fresh()
    const id = createEvent()
    const todos: EventTodo[] = [
      { id: generateId(), title: 'Book restaurant', isCompleted: false },
    ]
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ notes: 'Valentines dinner', todos }))

    const saved = getEvent(id)
    expect(saved.notes).toBe('Valentines dinner')
    expect(saved.todos).toHaveLength(1)
    expect(saved.todos![0].title).toBe('Book restaurant')
  })

  it('second updateEvent call does not lose notes or todos from first call', () => {
    fresh()
    const id = createEvent()
    const { updateEvent } = useAppStore.getState()

    // First save: add notes
    updateEvent(id, makeSaveData({ notes: 'Important notes', title: 'My Event' }))
    expect(getEvent(id).notes).toBe('Important notes')

    // Second save: add todos (notes still provided — simulates user re-saving)
    const todos: EventTodo[] = [
      { id: generateId(), title: 'Step 1', isCompleted: false },
    ]
    updateEvent(id, makeSaveData({ notes: 'Important notes', todos, title: 'My Event' }))

    const saved = getEvent(id)
    expect(saved.notes).toBe('Important notes')
    expect(saved.todos).toHaveLength(1)
    expect(saved.todos![0].title).toBe('Step 1')
  })
})

// ── 4. startTime ──────────────────────────────────────────────────────────────

describe('unlinked event: startTime field', () => {
  it('updateEvent sets startTime', () => {
    fresh()
    const id = createEvent()
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ startTime: '19:30' }))
    expect(getEvent(id).startTime).toBe('19:30')
  })

  it('updateEvent clears startTime when empty string is passed (→ undefined)', () => {
    fresh()
    const id = createEvent({ startTime: '10:00' })
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ startTime: '' }))
    expect(getEvent(id).startTime).toBeUndefined()
  })
})

// ── 5. endTime ────────────────────────────────────────────────────────────────

describe('unlinked event: endTime field', () => {
  it('updateEvent sets endTime', () => {
    fresh()
    const id = createEvent()
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ endTime: '21:00' }))
    expect(getEvent(id).endTime).toBe('21:00')
  })

  it('updateEvent preserves existing fields when only endTime changes', () => {
    fresh()
    const id = createEvent({ notes: 'Keep this', startTime: '19:30' })
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ notes: 'Keep this', startTime: '19:30', endTime: '21:00' }))

    const saved = getEvent(id)
    expect(saved.endTime).toBe('21:00')
    expect(saved.startTime).toBe('19:30')
    expect(saved.notes).toBe('Keep this')
  })
})

// ── 6. color ──────────────────────────────────────────────────────────────────

describe('unlinked event: color field', () => {
  it('updateEvent changes color', () => {
    fresh()
    const id = createEvent({ color: 'yellow' })
    const { updateEvent } = useAppStore.getState()
    updateEvent(id, makeSaveData({ color: 'blue' }))
    expect(getEvent(id).color).toBe('blue')
  })
})

// ── 7. Other events are not affected ─────────────────────────────────────────

describe('unlinked event: isolation', () => {
  it('updateEvent only modifies the target event, not siblings', () => {
    fresh()
    const id1 = createEvent({ title: 'Event One' })
    const id2 = createEvent({ title: 'Event Two' })

    const { updateEvent } = useAppStore.getState()
    updateEvent(id1, makeSaveData({ title: 'Event One', notes: 'Notes for one' }))

    expect(getEvent(id1).notes).toBe('Notes for one')
    expect(getEvent(id2).notes).toBeUndefined()
  })

  it('updating a goal-linked event does not bleed notes into unlinked sibling', () => {
    fresh()
    // Create a goal (which creates a linked event)
    const { addGoal, addEvent } = useAppStore.getState()
    const goalId = addGoal('life', 'Trip to Paris', undefined, '2027-06-01', 0, '14:00')
    const linkedEvent = useAppStore.getState().events.find(e => e.linkedGoalId === goalId)!
    const unlinkedId = addEvent(makeSaveData({ title: 'Unrelated event' }))

    const { updateEvent, updateGoal } = useAppStore.getState()
    // Simulate saving the linked event with notes
    updateEvent(linkedEvent.id, makeSaveData({ title: 'Trip to Paris', notes: 'Pack light', startTime: '14:00' }))
    updateGoal(goalId, { notes: 'Pack light', startTime: '14:00' })

    // Unlinked event must be unaffected
    expect(getEvent(unlinkedId).notes).toBeUndefined()
    expect(getEvent(unlinkedId).todos).toBeUndefined()
  })
})
