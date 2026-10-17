/**
 * Regression tests for Goal ↔ linked CalendarEvent data sync.
 *
 * Covers the bug where Dreams (Goals with a targetDate) created via
 * FullCreateSheet showed empty time and items in the EventModal because:
 *   1. addGoal never copied startTime to the linked CalendarEvent
 *   2. updateGoal never synced checklist (as todos) to the linked event
 *   3. EventModal.handleSave omitted endTime from the saved data object
 */

import { beforeEach, expect, it } from 'vitest'
import { useAppStore } from '@/store/useAppStore'

function fresh() {
  useAppStore.setState({
    currentUser: 'mateo',
    events: [],
    goals: [],
  } as never)
}

// ── addGoal ──────────────────────────────────────────────────────────────────

it('addGoal with targetDate copies startTime to the linked CalendarEvent', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Trip to Paris', undefined, '2027-06-01', 0, '14:00')

  const { events, goals } = useAppStore.getState()
  expect(goals).toHaveLength(1)
  expect(goals[0].startTime).toBe('14:00')

  const linked = events.find(e => e.linkedGoalId === goals[0].id)
  expect(linked).toBeDefined()
  expect(linked!.startTime).toBe('14:00')
})

it('addGoal with targetDate and checklist copies checklist to goal and todos to linked event', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Trip to Paris', undefined, '2027-06-01', 0, '14:00', ['Buy tickets', 'Book hotel'])

  const { events, goals } = useAppStore.getState()
  expect(goals[0].checklist).toEqual(['Buy tickets', 'Book hotel'])

  const linked = events.find(e => e.linkedGoalId === goals[0].id)!
  expect(linked).toBeDefined()
  expect(linked.todos).toHaveLength(2)
  expect(linked.todos!.map(t => t.title)).toEqual(['Buy tickets', 'Book hotel'])
  expect(linked.todos!.every(t => !t.isCompleted)).toBe(true)
})

it('addGoal with checklist but no targetDate sets checklist on goal only', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Open dream', undefined, undefined, 0, undefined, ['Step 1', 'Step 2'])

  const { goals, events } = useAppStore.getState()
  expect(goals[0].checklist).toEqual(['Step 1', 'Step 2'])
  // No linked event because no targetDate
  expect(events).toHaveLength(0)
  expect(goals[0].linkedEventId).toBeUndefined()
})

it('addGoal with targetDate copies notes to the linked CalendarEvent', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Paris trip', 'Book flights', '2027-06-01', 0)

  const { events, goals } = useAppStore.getState()
  expect(goals[0].notes).toBe('Book flights')

  const linked = events.find(e => e.linkedGoalId === goals[0].id)!
  expect(linked).toBeDefined()
  expect(linked.notes).toBe('Book flights')
})

it('addGoal without notes creates linked event without notes', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Dream vacation', undefined, '2027-07-01', 0)

  const { events, goals } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goals[0].id)!
  expect(linked.notes).toBeUndefined()
})

it('addGoal without startTime creates linked event without startTime', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Dream vacation', undefined, '2027-07-01', 0)

  const { events, goals } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goals[0].id)
  expect(linked).toBeDefined()
  expect(linked!.startTime).toBeUndefined()
})

it('addGoal without targetDate does not create a linked CalendarEvent', () => {
  fresh()
  const { addGoal } = useAppStore.getState()
  addGoal('life', 'Open-ended dream', undefined, undefined, 0, '09:00')

  const { events, goals } = useAppStore.getState()
  expect(goals[0].linkedEventId).toBeUndefined()
  expect(events).toHaveLength(0)
})

// ── updateGoal: checklist sync ────────────────────────────────────────────────

it('updateGoal with checklist syncs todos to the linked CalendarEvent', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Pack for trip', undefined, '2027-06-01', 0)

  updateGoal(goalId, { checklist: ['Buy tickets', 'Book hotel', 'Pack bags'] })

  const { events, goals } = useAppStore.getState()
  const goal = goals.find(g => g.id === goalId)!
  expect(goal.checklist).toEqual(['Buy tickets', 'Book hotel', 'Pack bags'])

  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.todos).toHaveLength(3)
  expect(linked.todos!.map(t => t.title)).toEqual(['Buy tickets', 'Book hotel', 'Pack bags'])
  // todos should be unchecked (isCompleted: false)
  expect(linked.todos!.every(t => !t.isCompleted)).toBe(true)
})

it('updateGoal clearing checklist clears todos on the linked event', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Trip', undefined, '2027-06-01', 0)
  updateGoal(goalId, { checklist: ['Item A'] })
  updateGoal(goalId, { checklist: [] })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.todos).toEqual([])
})

// ── updateGoal: notes sync ────────────────────────────────────────────────────

it('updateGoal with notes syncs notes to the linked CalendarEvent', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Pack for trip', undefined, '2027-06-01', 0)

  updateGoal(goalId, { notes: 'Pack light, book early' })

  const { events, goals } = useAppStore.getState()
  const goal = goals.find(g => g.id === goalId)!
  expect(goal.notes).toBe('Pack light, book early')

  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.notes).toBe('Pack light, book early')
})

it('updateGoal clearing notes clears notes on the linked event', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Trip', 'Old note', '2027-06-01', 0)
  updateGoal(goalId, { notes: '' })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.notes).toBeUndefined()
})

// ── updateGoal: startTime sync ────────────────────────────────────────────────

it('updateGoal with startTime syncs it to the linked CalendarEvent', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('travel', 'Weekend hike', undefined, '2027-05-10', 0)

  updateGoal(goalId, { startTime: '08:30' })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.startTime).toBe('08:30')
})

it('updateGoal clearing startTime clears it on the linked CalendarEvent', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('travel', 'Sunrise hike', undefined, '2027-05-10', 0, '06:00')
  updateGoal(goalId, { startTime: '' })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.startTime).toBeUndefined()
})

// ── updateGoal: date + startTime + checklist together ────────────────────────

it('updateGoal with targetDate + startTime + checklist syncs all fields', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Big event', undefined, '2027-01-01', 0)

  updateGoal(goalId, {
    targetDate: '2027-03-15',
    startTime: '19:00',
    checklist: ['Dress code', 'RSVP'],
  })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked.date).toBe('2027-03-15')
  expect(linked.startTime).toBe('19:00')
  expect(linked.todos!.map(t => t.title)).toEqual(['Dress code', 'RSVP'])
})

it('updateGoal adding a targetDate to a goal without one creates linked event with startTime', () => {
  fresh()
  const { addGoal, updateGoal } = useAppStore.getState()
  const goalId = addGoal('life', 'Undated dream', undefined, undefined, 0, '10:00')
  // Initially no linked event
  expect(useAppStore.getState().events).toHaveLength(0)

  updateGoal(goalId, { targetDate: '2027-08-20', startTime: '10:00' })

  const { events } = useAppStore.getState()
  const linked = events.find(e => e.linkedGoalId === goalId)!
  expect(linked).toBeDefined()
  expect(linked.date).toBe('2027-08-20')
  expect(linked.startTime).toBe('10:00')
})
