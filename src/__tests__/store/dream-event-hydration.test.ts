/**
 * Regression tests for Dream data hydration in both UI paths:
 *
 * Path A — Today Events: opens EventModal with the linked CalendarEvent.
 *   The linked event may be sparse (old Dreams pre-sync-fix). EventModal
 *   must fall back to the linked Goal for startTime, notes, todos, photos.
 *
 * Path B — Dreams section: opens CategoryHub inline edit form.
 *   The edit form must load and save checklist and photos from/to the Goal.
 *
 * These tests verify the Zustand store layer (data integrity). UI-layer
 * hydration logic in EventModal and CategoryHub is covered by e2e tests.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store/useAppStore'

function fresh() {
  useAppStore.setState({
    currentUser: 'mateo',
    events: [],
    goals: [],
  } as never)
}

// ── Path A: Today Events → EventModal ────────────────────────────────────────
// The store must expose enough data for EventModal to hydrate fully from
// the linked Goal when the CalendarEvent is sparse.

describe('Path A – Today Events (EventModal hydration via linked Goal)', () => {
  it('linked CalendarEvent has startTime when Dream is created with startTime', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    addGoal('life', 'Paris trip', undefined, '2027-06-01', 0, '14:00')

    const { events, goals } = useAppStore.getState()
    const goal = goals[0]
    const linked = events.find(e => e.linkedGoalId === goal.id)!

    expect(linked).toBeDefined()
    expect(linked.startTime).toBe('14:00')   // EventModal primary source
    expect(goal.startTime).toBe('14:00')     // EventModal fallback source
  })

  it('linked CalendarEvent has notes when Dream has notes', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Paris trip', 'Pack light', '2027-06-01', 0)

    // notes must be on both the goal AND the linked event
    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!
    expect(goal.notes).toBe('Pack light')
    expect(linked.notes).toBe('Pack light')    // EventModal primary source after fix
  })

  it('addGoal with checklist sets goal.checklist AND event.todos atomically', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    // Checklist is now passed atomically — same single store write as startTime
    const goalId = addGoal('life', 'Pack for trip', undefined, '2027-06-01', 0, undefined, ['Buy tickets', 'Book hotel'])

    const { events, goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    // goal.checklist — for CategoryHub Dreams edit form fallback
    expect(goal.checklist).toEqual(['Buy tickets', 'Book hotel'])
    // event.todos — for EventModal Today Events path (primary source)
    expect(linked.todos).toHaveLength(2)
    expect(linked.todos!.map(t => t.title)).toEqual(['Buy tickets', 'Book hotel'])
    expect(linked.todos!.every(t => !t.isCompleted)).toBe(true)
  })

  it('photos on Goal are accessible for EventModal fallback', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Dream vacation', undefined, '2027-07-01', 0)
    updateGoal(goalId, { photos: ['https://example.com/photo1.jpg'] })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.photos).toEqual(['https://example.com/photo1.jpg'])
  })

  it('editing via EventModal (updateGoal) keeps checklist intact on Goal', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('travel', 'Hike', undefined, '2027-05-10', 0, '08:00')
    updateGoal(goalId, { checklist: ['Boots', 'Water'] })

    // Simulate EventModal.handleSave syncing only startTime + notes back to Goal
    updateGoal(goalId, { startTime: '09:00', notes: 'Updated note' })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    // checklist must NOT be wiped by the time-only update
    expect(goal.checklist).toEqual(['Boots', 'Water'])
    expect(goal.startTime).toBe('09:00')
    expect(goal.notes).toBe('Updated note')
  })
})

// ── Path B: Dreams section → CategoryHub inline edit ─────────────────────────
// updateGoal must persist checklist and photos correctly.

describe('Path B – Dreams section (CategoryHub edit form persistence)', () => {
  it('updateGoal with checklist persists checklist on Goal', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Big dream', undefined, undefined, 0)
    updateGoal(goalId, { checklist: ['Step 1', 'Step 2', 'Step 3'] })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.checklist).toEqual(['Step 1', 'Step 2', 'Step 3'])
  })

  it('updateGoal with photos persists photos on Goal', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Dream home', undefined, undefined, 0)
    updateGoal(goalId, { photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg'] })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.photos).toEqual(['https://example.com/a.jpg', 'https://example.com/b.jpg'])
  })

  it('updateGoal with checklist + date + time persists all three', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'New Year', undefined, undefined, 0)

    updateGoal(goalId, {
      targetDate: '2027-01-01',
      startTime: '00:00',
      checklist: ['Champagne', 'Fireworks'],
    })

    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.targetDate).toBe('2027-01-01')
    expect(goal.startTime).toBe('00:00')
    expect(goal.checklist).toEqual(['Champagne', 'Fireworks'])

    // A linked event should have been created when targetDate was added
    const linked = events.find(e => e.linkedGoalId === goalId)
    expect(linked).toBeDefined()
    expect(linked!.date).toBe('2027-01-01')
    expect(linked!.startTime).toBe('00:00')
  })

  it('clearing checklist via updateGoal removes it from Goal', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Clear test', undefined, undefined, 0)
    updateGoal(goalId, { checklist: ['Item'] })
    updateGoal(goalId, { checklist: [] })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    // empty checklist → cleared (undefined or [])
    expect(goal.checklist?.length ?? 0).toBe(0)
  })

  it('title and notes updates do not wipe existing checklist', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Stable dream', undefined, undefined, 0)
    updateGoal(goalId, { checklist: ['Keep me'] })
    updateGoal(goalId, { title: 'Updated title', notes: 'New notes' })

    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.title).toBe('Updated title')
    expect(goal.notes).toBe('New notes')
    expect(goal.checklist).toEqual(['Keep me'])
  })

  // ── Regression: atomic creation + reopen simulation ──────────────────────────

  it('Dream created with checklist has checklist after reopening from Dreams section', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    // Simulate FullCreateSheet: passes checklist atomically (7th param)
    const goalId = addGoal('life', 'Trip', undefined, undefined, 0, undefined, ['Pack bags', 'Book hotel'])

    // Simulate "reopening" from Dreams section (CategoryHub openEdit reads goal.checklist)
    const { goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    expect(goal.checklist).toEqual(['Pack bags', 'Book hotel'])
  })

  it('Dream with targetDate: checklist visible in Today Events path after creation', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Trip', undefined, '2027-06-01', 0, '10:00', ['Passport', 'Sunscreen'])

    // Simulate Today Events path: EventModal receives the linked CalendarEvent
    const { events, goals } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    // EventModal reads event.todos (primary)
    expect(linked.todos).toHaveLength(2)
    expect(linked.todos!.map(t => t.title)).toEqual(['Passport', 'Sunscreen'])
    // and falls back to goal.checklist if todos missing (backward compat)
    expect(goal.checklist).toEqual(['Passport', 'Sunscreen'])
  })

  // ── Full Dream object: all fields survive creation and reopen ─────────────────

  it('full Dream object: all fields on Goal and linked Event after creation', () => {
    fresh()
    const { addGoal } = useAppStore.getState()
    const goalId = addGoal(
      'travel',
      'Paris Trip',
      'Book flights early',
      '2027-06-01',
      0,
      '10:00',
      ['Passport', 'Sunscreen'],
    )

    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    // ── Goal fields ──
    expect(goal.title).toBe('Paris Trip')
    expect(goal.notes).toBe('Book flights early')
    expect(goal.targetDate).toBe('2027-06-01')
    expect(goal.startTime).toBe('10:00')
    expect(goal.checklist).toEqual(['Passport', 'Sunscreen'])
    expect(goal.categoryId).toBe('travel')
    expect(goal.isCompleted).toBe(false)
    expect(goal.progressCurrent).toBe(0)
    expect(goal.linkedEventId).toBe(linked.id)

    // ── Linked CalendarEvent fields (Today Events path) ──
    expect(linked.title).toBe('Paris Trip')
    expect(linked.notes).toBe('Book flights early')     // ← was missing before fix
    expect(linked.date).toBe('2027-06-01')
    expect(linked.startTime).toBe('10:00')
    expect(linked.todos).toHaveLength(2)
    expect(linked.todos!.map(t => t.title)).toEqual(['Passport', 'Sunscreen'])
    expect(linked.linkedGoalId).toBe(goalId)
  })

  it('updateGoal: all fields survive an edit from CategoryHub Dreams path', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Original', undefined, undefined, 0)

    updateGoal(goalId, {
      title: 'Updated Title',
      notes: 'Updated notes',
      targetDate: '2027-09-15',
      startTime: '08:30',
      checklist: ['Step A', 'Step B'],
    })

    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    // Goal fields updated
    expect(goal.title).toBe('Updated Title')
    expect(goal.notes).toBe('Updated notes')
    expect(goal.targetDate).toBe('2027-09-15')
    expect(goal.startTime).toBe('08:30')
    expect(goal.checklist).toEqual(['Step A', 'Step B'])

    // Linked event also updated
    expect(linked).toBeDefined()
    expect(linked.title).toBe('Updated Title')
    expect(linked.notes).toBe('Updated notes')
    expect(linked.date).toBe('2027-09-15')
    expect(linked.startTime).toBe('08:30')
    expect(linked.todos!.map(t => t.title)).toEqual(['Step A', 'Step B'])
  })

  it('notes on Goal are reflected on linked event and survive non-notes updateGoal call', () => {
    fresh()
    const { addGoal, updateGoal } = useAppStore.getState()
    const goalId = addGoal('life', 'Dream', 'My important note', '2027-06-01', 0, '09:00')

    // Simulate EventModal saving only startTime back (no notes change)
    updateGoal(goalId, { startTime: '10:00' })

    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    // Notes must NOT be wiped by the non-notes update
    expect(goal.notes).toBe('My important note')
    expect(linked.notes).toBe('My important note')  // still on event from creation
    expect(linked.startTime).toBe('10:00')           // updated correctly
  })

  it('cross-profile: Seval Dream checklist is preserved for Mateo view', () => {
    fresh()
    // Seval creates a Dream
    useAppStore.setState({ currentUser: 'seval' } as never)
    const { addGoal } = useAppStore.getState()
    const goalId = addGoal('travel', 'Santorini', undefined, '2027-08-01', 0, '09:00', ['Flights', 'Hotel'])

    // Switch to Mateo (same shared state)
    useAppStore.setState({ currentUser: 'mateo' } as never)

    const { goals, events } = useAppStore.getState()
    const goal = goals.find(g => g.id === goalId)!
    const linked = events.find(e => e.linkedGoalId === goalId)!

    expect(goal.checklist).toEqual(['Flights', 'Hotel'])
    expect(linked.todos).toHaveLength(2)
    expect(linked.todos!.map(t => t.title)).toEqual(['Flights', 'Hotel'])
  })
})
