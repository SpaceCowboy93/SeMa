import { beforeEach, expect, it, vi } from 'vitest'
import { clearActiveCouple, useAppStore } from '@/store/useAppStore'
import { eventDraftValues, goalDraftValues, goalChecklist } from '@/lib/dream-checklist'
import { mergeDraft, resolveDraftConflicts } from '@/lib/draft-merge'
import { rebaseSharedState } from '@/lib/sync-merge'
import { isValidRemoteSharedState } from '@/lib/shared-state'
import type { EventTodo } from '@/types'

const items: EventTodo[] = [
  { id: 'pack', title: 'Pack', isCompleted: true },
  { id: 'flights', title: 'Flights', isCompleted: false },
]
beforeEach(() => { clearActiveCouple(); useAppStore.getState().setCurrentUser('mateo') })
function create(date: string | undefined = '2027-06-01') {
  return useAppStore.getState().addGoal('life', 'Trip', 'Original notes', date, 0, '10:00', structuredClone(items))
}
function pair() { const { goals, events } = useAppStore.getState(); return { goal: goals[0], event: events[0] } }

it('creates a structured Dream and linked Calendar checklist in one notification', () => {
  const listener = vi.fn()
  const unsubscribe = useAppStore.subscribe(listener)
  create()
  expect(listener).toHaveBeenCalledTimes(1)
  expect(pair().goal.checklistItems).toEqual(items)
  expect(pair().goal.checklist).toEqual(['Pack', 'Flights'])
  expect(pair().event.todos).toEqual(items)
  expect(pair().goal.linkedEventId).toBe(pair().event.id)
  expect(pair().event.linkedGoalId).toBe(pair().goal.id)
  unsubscribe()
})

it('preserves IDs and completion on unchanged saves without notifications or timestamp changes', () => {
  const id = create(), before = useAppStore.getState(), at = pair().event.updatedAt
  const listener = vi.fn(), unsubscribe = useAppStore.subscribe(listener)
  before.updateGoal(id, { checklist: ['Pack', 'Flights'] })
  before.updateEvent(pair().event.id, { todos: structuredClone(items), title: 'Trip' })
  expect(useAppStore.getState()).toBe(before)
  expect(listener).not.toHaveBeenCalled()
  expect(pair().event.updatedAt).toBe(at)
  expect(pair().event.todos).toEqual(items)
  unsubscribe()
})

it('propagates Calendar additions, renames, toggles, and deletions atomically to the Dream', () => {
  create()
  const changed = [{ ...items[0], title: 'Pack early', isCompleted: false }, { id: 'new', title: 'Hotel', isCompleted: true }]
  const listener = vi.fn(), unsubscribe = useAppStore.subscribe(listener)
  useAppStore.getState().updateEvent(pair().event.id, { todos: changed })
  expect(listener).toHaveBeenCalledTimes(1)
  expect(pair().goal.checklistItems).toEqual(changed)
  expect(pair().goal.checklist).toEqual(['Pack early', 'Hotel'])
  expect(pair().event.todos).toEqual(changed)
  unsubscribe()
})

it('propagates structured Dream edits to Calendar with unchanged item identities', () => {
  const id = create()
  const changed = [{ ...items[1], title: 'Tickets', isCompleted: true }]
  useAppStore.getState().updateGoal(id, { checklistItems: changed })
  expect(pair().event.todos).toEqual(changed)
  expect(pair().goal.checklist).toEqual(['Tickets'])
})

it('keeps identity and completion for compatible legacy text renames and reorders', () => {
  const id = create()
  useAppStore.getState().updateGoal(id, { checklist: ['Pack early', 'Flights'] })
  expect(pair().event.todos?.[0]).toEqual({ ...items[0], title: 'Pack early' })
  useAppStore.getState().updateGoal(id, { checklist: ['Flights', 'Pack early'] })
  expect(pair().event.todos?.map(item => item.id)).toEqual(['flights', 'pack'])
})

it('distinguishes omitted/undefined Dream checklists from explicit empty arrays', () => {
  const id = create()
  useAppStore.getState().updateGoal(id, { notes: 'New', checklist: undefined, checklistItems: undefined })
  expect(pair().goal.checklistItems).toEqual(items)
  expect(pair().event.todos).toEqual(items)
  useAppStore.getState().updateGoal(id, { checklist: [] })
  expect(pair().goal.checklistItems).toEqual([])
  expect(pair().goal.checklist).toEqual([])
  expect(pair().event.todos).toEqual([])
})

it('clears Calendar items on both sides and does not resurrect them when reopening', () => {
  create()
  useAppStore.getState().updateEvent(pair().event.id, { notes: 'New notes' })
  useAppStore.getState().updateEvent(pair().event.id, { todos: undefined })
  expect(pair().event.todos).toEqual(items)
  expect(pair().goal.checklistItems).toEqual(items)
  useAppStore.getState().updateEvent(pair().event.id, { todos: [] })
  expect(eventDraftValues(pair().event, pair().goal).todos).toEqual([])
  expect(goalDraftValues(pair().goal, pair().event).checklistItems).toEqual([])
})

it('assigns a date while clearing an undated Dream without the old checklist fallback', () => {
  const id = useAppStore.getState().addGoal('life', 'Undated', undefined, undefined, 0, undefined, structuredClone(items))
  useAppStore.getState().updateGoal(id, { targetDate: '2027-06-02', checklist: [] })
  expect(pair().goal.checklistItems).toEqual([])
  expect(pair().event.todos).toEqual([])
})

it('preserves completion while removing and restoring a Dream date', () => {
  const id = create()
  useAppStore.getState().updateGoal(id, { targetDate: undefined })
  expect(useAppStore.getState().events).toEqual([])
  expect(pair().goal.checklistItems).toEqual(items)
  useAppStore.getState().updateGoal(id, { targetDate: '2027-06-03' })
  expect(pair().event.todos).toEqual(items)
})

it('deleting Calendar unlinks its Dream, preserves items, and does not recreate it on a notes edit', () => {
  const id = create()
  useAppStore.getState().deleteEvent(pair().event.id)
  expect(pair().goal.targetDate).toBeUndefined()
  expect(pair().goal.linkedEventId).toBeUndefined()
  expect(pair().goal.checklistItems).toEqual(items)
  useAppStore.getState().updateGoal(id, { notes: 'Undated' })
  expect(useAppStore.getState().events).toEqual([])
})

it('adopts an existing orphan link without a duplicate event or regenerated checklist', () => {
  const id = create(), eventId = pair().event.id
  useAppStore.setState({ goals: [{ ...pair().goal, linkedEventId: undefined }] })
  useAppStore.getState().updateGoal(id, { targetDate: '2027-06-04' })
  expect(useAppStore.getState().events).toHaveLength(1)
  expect(pair().event.id).toBe(eventId)
  expect(pair().goal.linkedEventId).toBe(eventId)
  expect(pair().event.todos).toEqual(items)
})

it('does not use a stale explicit empty event checklist as a signal to restore legacy Goal text', () => {
  create()
  const event = { ...pair().event, todos: [] }
  expect(eventDraftValues(event, { ...pair().goal, checklistItems: undefined }).todos).toEqual([])
  expect(goalChecklist({ ...pair().goal, checklistItems: undefined, checklist: [] }, pair().event)).toEqual([])
})

it('merges stale drafts with independent partner fields and checklist item changes', () => {
  create()
  const opening = eventDraftValues(pair().event, pair().goal)
  const mine = { ...opening, title: 'My title', todos: [{ ...items[0], title: 'My rename' }, items[1]] }
  const latest = { ...opening, notes: 'Partner notes', todos: [{ ...items[0], isCompleted: false }, items[1], { id: 'partner', title: 'Partner addition', isCompleted: false }] }
  const result = mergeDraft(opening, mine, latest)
  expect(result.conflicts).toEqual([])
  expect(result.merged).toMatchObject({ title: 'My title', notes: 'Partner notes' })
  expect(result.merged.todos).toEqual([{ ...items[0], title: 'My rename', isCompleted: false }, items[1], latest.todos[2]])
  expect(result.changes.notes).toBeUndefined()
})

it('retains both same-field versions until an explicit choice and rechecks changed partner values', () => {
  const opening = { title: 'Original', notes: '' }, mine = { title: 'Mine', notes: 'Local notes' }, latest = { title: 'Partner', notes: '' }
  const blocked = mergeDraft(opening, mine, latest)
  expect(blocked.conflicts).toEqual([{ path: 'title', mine: 'Mine', latest: 'Partner' }])
  for (const choice of ['mine', 'latest'] as const) {
    const choices = resolveDraftConflicts(blocked.conflicts, choice)
    const resolved = mergeDraft(opening, mine, latest, choices)
    expect(resolved.conflicts).toEqual([])
    expect(resolved.merged.title).toBe(choice === 'mine' ? 'Mine' : 'Partner')
    expect(resolved.merged.notes).toBe('Local notes')
    expect(mergeDraft(opening, mine, { ...latest, title: 'New partner version' }, choices).conflicts).toHaveLength(1)
  }
  expect(mine.title).toBe('Mine'); expect(latest.title).toBe('Partner')
})

it('requires explicit resolution of a checklist edit/delete race', () => {
  const opening = { todos: [items[0]] }, mine = { todos: [] }, latest = { todos: [{ ...items[0], title: 'Partner rename' }] }
  const blocked = mergeDraft(opening, mine, latest)
  expect(blocked.conflicts[0]).toMatchObject({ path: 'todos.pack', mine: undefined, latest: latest.todos[0] })
  expect(mergeDraft(opening, mine, latest, resolveDraftConflicts(blocked.conflicts, 'mine')).merged.todos).toEqual([])
})

it('preserves local reorder and partner item edits without regenerating IDs', () => {
  const opening = { todos: items }, mine = { todos: [items[1], items[0]] }, latest = { todos: [{ ...items[0], title: 'Renamed' }, items[1]] }
  const result = mergeDraft(opening, mine, latest)
  expect(result.conflicts).toEqual([])
  expect(result.merged.todos).toEqual([items[1], latest.todos[0]])
})

it('merges photo additions and deletions against the opening snapshot', () => {
  const result = mergeDraft({ photos: ['a', 'b'] }, { photos: ['b', 'mine'] }, { photos: ['a', 'b', 'partner'] })
  expect(result.conflicts).toEqual([])
  expect(result.merged.photos).toEqual(['b', 'partner', 'mine'])
})

it('merges legacy-to-structured concurrent checklist edits coherently on both shared fields', () => {
  create()
  const base = { goals: [{ ...pair().goal, checklistItems: undefined }], events: [pair().event] }
  const localItems = [{ ...items[0], title: 'Local rename' }, items[1]]
  const remoteItems = [{ ...items[0], isCompleted: false }, items[1]]
  const snapshot = (values: EventTodo[]) => ({
    goals: [{ ...pair().goal, checklistItems: values, checklist: values.map(item => item.title) }],
    events: [{ ...pair().event, todos: values }],
  })
  const result = rebaseSharedState(base, snapshot(localItems), snapshot(remoteItems), new Set(['goals', 'events']))
  expect(result.conflicts).toEqual([])
  const merged = [{ ...items[0], title: 'Local rename', isCompleted: false }, items[1]]
  expect(result.state.goals?.[0].checklistItems).toEqual(merged)
  expect(result.state.events?.[0].todos).toEqual(merged)
  expect(result.state.goals?.[0].checklist).toEqual(['Local rename', 'Flights'])
})

it('keeps both halves pending when a linked delete conflicts but permits unrelated fields', () => {
  create()
  const base = { goals: [pair().goal], events: [pair().event], monthlyIncome: 100 }
  const local = { goals: [], events: [], monthlyIncome: 200 }
  const remote = { ...base, events: [{ ...pair().event, notes: 'Partner edit' }] }
  const result = rebaseSharedState(base, local, remote, new Set(['goals', 'events', 'monthlyIncome']))
  expect(result.conflicts.sort()).toEqual(['events', 'goals'])
  expect(result.state.goals).toEqual(base.goals)
  expect(result.state.monthlyIncome).toBe(200)
})

it('quarantines malformed structured checklist data while accepting legacy Dreams', () => {
  create()
  expect(isValidRemoteSharedState({ goals: [pair().goal] })).toBe(true)
  expect(isValidRemoteSharedState({ goals: [{ ...pair().goal, checklistItems: undefined }] })).toBe(true)
  expect(isValidRemoteSharedState({ goals: [{ ...pair().goal, checklistItems: [null] }] })).toBe(false)
  expect(isValidRemoteSharedState({ goals: [{ ...pair().goal, checklist: [] }] })).toBe(false)
  expect(isValidRemoteSharedState({ goals: [{ ...pair().goal, checklistItems: undefined, checklist: 'invalid' }] })).toBe(false)
  expect(goalChecklist(pair().goal, pair().event)).toEqual(items)
})
