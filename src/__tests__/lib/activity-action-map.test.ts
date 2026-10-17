import { describe, expect, it } from 'vitest'
import { describeActivityChange } from '@/lib/activity-action-map'

describe('partner activity change detection', () => {
  const event = { id: 'e1', title: 'Dinner', date: '2026-11-19', createdBy: 'mateo' }
  it('records new events only after a genuine collection change', () => {
    expect(describeActivityChange('addEvent', { events: [] }, { events: [event] }))
      .toMatchObject({ entityType: 'event', actionType: 'created', entityId: 'e1' })
    expect(describeActivityChange('addEvent', { events: [event] }, { events: [event] })).toBeNull()
  })
  it('records edits and deletions', () => {
    const edited = { ...event, date: '2026-11-20' }
    expect(describeActivityChange('updateEvent', { events: [event] }, { events: [edited] }))
      .toMatchObject({ entityType: 'event', actionType: 'updated', entityId: 'e1' })
    expect(describeActivityChange('deleteEvent', { events: [event] }, { events: [] }))
      .toMatchObject({ entityType: 'event', actionType: 'deleted', entityId: 'e1' })
  })
  it('ignores non-user operations and unrelated collections', () => {
    expect(describeActivityChange('supabasePull', { events: [] }, { events: [event] })).toBeNull()
    expect(describeActivityChange('updateEvent', { events: [event] }, { events: [event], todos: [event] })).toBeNull()
  })
  it('converts completed and reopened tasks to distinct action types', () => {
    const todo = { id: 't1', title: 'Packing', isCompleted: false }
    const done = { ...todo, isCompleted: true }
    expect(describeActivityChange('toggleTodo', { todos: [todo] }, { todos: [done] })?.actionType)
      .toBe('completed')
    expect(describeActivityChange('toggleTodo', { todos: [done] }, { todos: [todo] })?.actionType)
      .toBe('updated')
  })
  it('labels newly achieved goals as achievements', () => {
    const goal = { id: 'g1', title: 'Holiday', isCompleted: false }
    expect(describeActivityChange('updateGoal', { goals: [goal] },
      { goals: [{ ...goal, isCompleted: true }] })?.actionType).toBe('achieved')
  })
})
