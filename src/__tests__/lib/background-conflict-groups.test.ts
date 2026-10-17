import { expect, it } from 'vitest'
import { rebaseSharedState, resolveConflictGroup } from '@/lib/sync-merge'
import type { SharedState } from '@/lib/shared-state'

const original = { id: 'a', title: 'Original', notes: 'Base notes' }
const base = { todos: [original] } as Partial<SharedState>
it('identifies affected records and every conflicting field while isolating independent records', () => {
  const local = { todos: [{ ...original, title: 'Local', notes: 'Local notes' }, { id: 'local-only', title: 'Addition' }] } as Partial<SharedState>
  const remote = { todos: [{ ...original, title: 'Remote', notes: 'Remote notes' }, { id: 'remote-only', title: 'Addition' }] } as Partial<SharedState>
  const result = rebaseSharedState(base, local, remote, new Set(['todos']))
  expect(result.groups).toHaveLength(1)
  expect(result.groups[0].fields).toEqual(['title', 'notes'])
  for (const choice of ['local', 'remote'] as const) {
    const resolved = resolveConflictGroup(base, local, result.groups[0], choice)
    const next = rebaseSharedState(resolved.base, resolved.local, remote, new Set(['todos']))
    expect(next.conflicts).toEqual([])
    expect(next.state.todos?.map(todo => todo.title)).toEqual([choice === 'local' ? 'Local' : 'Remote', 'Addition', 'Addition'])
    expect(next.state.todos?.map(todo => todo.id)).toContain('local-only')
    expect(next.state.todos?.map(todo => todo.id)).toContain('remote-only')
  }
})

it('keeps another conflict unresolved when choosing one record in the same collection', () => {
  const b = { ...original, id: 'b' }
  const first = { todos: [original, b] } as Partial<SharedState>
  const local = { todos: [{ ...original, title: 'Local a' }, { ...b, title: 'Local b' }] } as Partial<SharedState>
  const remote = { todos: [{ ...original, title: 'Remote a' }, { ...b, title: 'Remote b' }] } as Partial<SharedState>
  const groups = rebaseSharedState(first, local, remote, new Set(['todos'])).groups
  const resolved = resolveConflictGroup(first, local, groups[0], 'remote')
  const next = rebaseSharedState(resolved.base, resolved.local, remote, new Set(['todos']))
  expect(next.groups).toHaveLength(1)
  expect(next.groups[0].members[0].recordId).toBe('b')
  expect(resolved.local.todos?.find(todo => todo.id === 'a')?.title).toBe('Remote a')
  expect(resolved.local.todos?.find(todo => todo.id === 'b')?.title).toBe('Local b')
})

it.each(['goals', 'todos'] as const)('groups a linked %s deletion with a Calendar edit and resolves both versions together', key => {
  const record = { ...original, linkedEventId: 'e' }
  const event = { ...original, id: 'e', [key === 'goals' ? 'linkedGoalId' : 'linkedTodoId']: 'a' }
  const first = { [key]: [record], events: [event] } as unknown as Partial<SharedState>
  const local = { [key]: [], events: [] } as Partial<SharedState>
  const remote = { [key]: [record], events: [{ ...event, title: 'Partner edit' }] } as unknown as Partial<SharedState>
  const pending = new Set<keyof SharedState>([key, 'events'])
  const result = rebaseSharedState(first, local, remote, pending)
  expect(result.conflicts.sort()).toEqual([key, 'events'].sort())
  expect(result.groups).toHaveLength(1)
  expect(result.groups[0].members.map(member => member.key).sort()).toEqual([key, 'events'].sort())
  const resolved = resolveConflictGroup(first, local, result.groups[0], 'remote')
  const next = rebaseSharedState(resolved.base, resolved.local, remote, pending)
  expect(next.conflicts).toEqual([])
  expect(next.state.events).toEqual(remote.events)
  expect(next.state[key]).toEqual(remote[key])
})

it('propagates conflict isolation across a linked operation spanning Dream, Calendar and To-Do', () => {
  const first = { goals: [{ ...original, linkedEventId: 'e' }], todos: [{ ...original, id: 't', linkedEventId: 'e' }],
    events: [{ ...original, id: 'e', linkedGoalId: 'a', linkedTodoId: 't' }] } as Partial<SharedState>
  const local = { goals: [], events: [], todos: [] }
  const remote = { ...first, todos: [{ ...first.todos![0], title: 'Partner' }] }
  const result = rebaseSharedState(first, local, remote, new Set(['goals', 'events', 'todos']))
  expect(result.conflicts.sort()).toEqual(['events', 'goals', 'todos'])
  expect(result.groups[0].members).toHaveLength(3)
})

it('keeps missing-baseline legacy linked collections in one explicit resolution group', () => {
  const local = { goals: [{ ...original, linkedEventId: 'e' }], events: [{ ...original, id: 'e', linkedGoalId: 'a' }] } as Partial<SharedState>
  const remote = { goals: [], events: [] }
  const result = rebaseSharedState({}, local, remote, new Set(['goals', 'events']))
  expect(result.groups).toHaveLength(1)
  expect(result.groups[0].members.map(member => member.key).sort()).toEqual(['events', 'goals'])
})

it('retains a local reorder when the partner edits a different item', () => {
  const a = { id: 'a', title: 'A', isCompleted: false }, b = { id: 'b', title: 'B', isCompleted: false }
  const event = { id: 'e', todos: [a, b] }
  const first = { events: [event] } as unknown as Partial<SharedState>
  const local = { events: [{ ...event, todos: [b, a] }] } as unknown as Partial<SharedState>
  const remote = { events: [{ ...event, todos: [{ ...a, isCompleted: true }, b] }] } as unknown as Partial<SharedState>
  const result = rebaseSharedState(first, local, remote, new Set(['events']))
  expect(result.conflicts).toEqual([])
  expect(result.state.events?.[0].todos).toEqual([b, { ...a, isCompleted: true }])
})

it('requires an explicit choice when both versions reorder the same checklist differently', () => {
  const a = { id: 'a', title: 'A', isCompleted: false }, b = { ...a, id: 'b' }, c = { ...a, id: 'c' }
  const event = { id: 'e', todos: [a, b, c] }
  const first = { events: [event] } as unknown as Partial<SharedState>
  const local = { events: [{ ...event, todos: [b, a, c] }] } as unknown as Partial<SharedState>
  const remote = { events: [{ ...event, todos: [a, c, b] }] } as unknown as Partial<SharedState>
  const result = rebaseSharedState(first, local, remote, new Set(['events']))
  expect(result.conflicts).toEqual(['events'])
  expect(result.groups[0].members[0].recordId).toBe('e')
  expect(result.groups[0].fields).toEqual(['todos'])
})

it('holds colliding additions with the same ID while allowing an unrelated addition to synchronize', () => {
  const first = { todos: [] }
  const mine = { id: 'collision', title: 'Local new record' }
  const theirs = { id: 'collision', title: 'Different server record' }
  const independent = { id: 'independent', title: 'Independent local record' }
  const local = { todos: [mine, independent] } as Partial<SharedState>
  const remote = { todos: [theirs] } as Partial<SharedState>
  const result = rebaseSharedState(first, local, remote, new Set(['todos']))
  expect(result.state.todos).toEqual([theirs, independent])
  expect(result.visible.todos).toEqual([mine, independent])
  expect(result.groups).toHaveLength(1)
  expect(result.groups[0].members[0]).toMatchObject({ recordId: 'collision', local: mine, remote: theirs })
  expect(result.remaining.has('todos')).toBe(true)
})

it('retains both copies of a duplicate nested ID in review instead of collapsing them through a keyed merge', () => {
  const first = { events: [{ id: 'event', todos: [] }] } as unknown as Partial<SharedState>
  const duplicates = [
    { id: 'duplicate', title: 'First local copy', isCompleted: false },
    { id: 'duplicate', title: 'Second local copy', isCompleted: true },
  ]
  const partner = [{ id: 'partner', title: 'Newer server item', isCompleted: false }]
  const local = { events: [{ id: 'event', todos: duplicates }] } as unknown as Partial<SharedState>
  const remote = { events: [{ id: 'event', todos: partner }] } as unknown as Partial<SharedState>
  const result = rebaseSharedState(first, local, remote, new Set(['events']))
  expect(result.conflicts).toEqual(['events'])
  expect(result.state.events?.[0].todos).toEqual(partner)
  expect(result.visible.events?.[0].todos).toEqual(duplicates)
  expect(result.groups[0].members[0]).toMatchObject({ local: { todos: duplicates }, remote: { todos: partner } })
})
