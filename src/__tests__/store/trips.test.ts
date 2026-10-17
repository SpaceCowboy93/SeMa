import { beforeEach, expect, it } from 'vitest'
import { clearActiveCouple, useAppStore } from '@/store/useAppStore'
import { isValidTrip, newTrip, recommendationPlan, tripSpending } from '@/lib/trips'
import { emptySharedState } from '@/lib/empty-shared-state'
import { isValidRemoteSharedState, selectSharedState } from '@/lib/shared-state'
import { rebaseSharedState } from '@/lib/sync-merge'
import type { TripDetails, TripPlan } from '@/types/trips'

const details: TripDetails = { title: 'Our escape', destination: 'Porto', country: 'Portugal', travellers: ['mateo', 'seval'], status: 'idea', budget: 1000, currency: 'EUR', notes: '' }
const plan = (id: string): TripPlan => ({ id, title: id, kind: 'activity', location: '', link: '', notes: '', isCompleted: false })
beforeEach(() => { clearActiveCouple(); useAppStore.setState({ currentUser: 'mateo' }) })

it('creates, edits, clears optional details, completes and deletes a shared trip', () => {
  const store = useAppStore.getState(), id = store.addTrip({ ...details, startDate: '2027-06-01', endDate: '2027-06-03' })
  store.updateTrip(id, { startDate: undefined, endDate: undefined, country: '', destination: '', notes: '', status: 'completed', budget: 0 })
  expect(useAppStore.getState().trips[0]).toMatchObject({ id, status: 'completed', notes: '', budget: 0, createdBy: 'mateo' })
  expect(useAppStore.getState().trips[0].startDate).toBeUndefined()
  expect(isValidTrip(useAppStore.getState().trips[0])).toBe(true)
  store.deleteTrip(id); expect(useAppStore.getState().trips).toEqual([])
})
it.each(['plans', 'packing', 'bookings', 'sharedNotes', 'expenses', 'recommendations'] as const)('reorders and removes %s without changing identity', collection => {
  const id = useAppStore.getState().addTrip(details)
  const entries = collection === 'plans' ? [plan('a'), plan('b')] : collection === 'sharedNotes' ? [{ id: 'a', title: 'A', content: '' }, { id: 'b', title: 'B', content: '' }]
    : collection === 'recommendations' ? ['a', 'b'].map(id => ({ id, title: id, category: 'food', description: '', location: '', link: '', notes: '' }))
      : collection === 'expenses' ? [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] : [{ id: 'a', title: 'A', isCompleted: true }, { id: 'b', title: 'B', isCompleted: false }]
  useAppStore.getState().updateTrip(id, { [collection]: entries })
  useAppStore.getState().moveTripEntry(id, collection, 'b', -1)
  expect(useAppStore.getState().trips[0][collection].map(e => e.id)).toEqual(['b', 'a'])
  useAppStore.getState().moveTripEntry(id, collection, 'b', -1)
  expect(useAppStore.getState().trips[0][collection].map(e => e.id)).toEqual(['b', 'a'])
  useAppStore.getState().updateTrip(id, { [collection]: [] }); expect(useAppStore.getState().trips[0][collection]).toEqual([])
})
it('rejects invalid dates, amounts, nested duplicates and unsafe booking URLs before state changes', () => {
  const id = useAppStore.getState().addTrip(details), original = useAppStore.getState().trips
  for (const changes of [{ budget: -1 }, { budget: Infinity }, { startDate: '2027-02-30' }, { startDate: '2027-05-02', endDate: '2027-05-01' }, { plans: [plan('same'), plan('same')] }, { plans: [{ ...plan('a'), link: 'javascript:alert(1)' }] }]) {
    expect(() => useAppStore.getState().updateTrip(id, changes)).toThrow()
    expect(useAppStore.getState().trips).toBe(original)
  }
  expect(isValidRemoteSharedState({ trips: [{ id: 'broken' }] })).toBe(false)
})
it('converts recommendations idempotently and totals estimated/actual costs including explicit zero', () => {
  const trip = newTrip(details, 'mateo'), rec = { id: 'r', title: 'Dinner', category: 'food' as const, description: 'A place to try', location: 'Porto', link: 'https://example.com', notes: '', estimatedCost: 40 }
  expect(recommendationPlan(rec, '2027-06-01')).toMatchObject({ id: 'recommendation:r', kind: 'restaurant', estimatedCost: 40, date: '2027-06-01' })
  expect(recommendationPlan(rec).id).toBe(recommendationPlan(rec).id)
  trip.plans = [{ ...recommendationPlan(rec), actualCost: 0 }]; trip.expenses = [{ id: 'e', title: 'Tickets', estimatedCost: 20, actualCost: 15 }]
  expect(tripSpending(trip)).toEqual({ estimated: 60, actual: 15 })
})
it('hydrates Trips through the protected selector while rejecting session identity', () => {
  const trip = newTrip(details, 'mateo')
  expect(selectSharedState({ trips: [trip], currentUser: 'seval' })).toEqual({ trips: [trip] })
  const empty = emptySharedState(); expect(isValidRemoteSharedState(empty)).toBe(true)
  expect(Object.values(empty).every(v => Array.isArray(v) ? v.length === 0 : v === 0 || v === false)).toBe(true)
})
it('merges different same-trip fields, nested completion and reorder without losing either client', () => {
  const base = newTrip(details, 'mateo'); base.plans = [plan('a'), plan('b')]
  const local = structuredClone(base), remote = structuredClone(base)
  local.title = 'Renamed'; local.plans.reverse(); remote.notes = 'Partner notes'; remote.plans[0].isCompleted = true
  const result = rebaseSharedState({ trips: [base] }, { trips: [local] }, { trips: [remote] }, new Set(['trips']))
  expect(result.conflicts).toEqual([])
  expect(result.state.trips?.[0]).toMatchObject({ title: 'Renamed', notes: 'Partner notes' })
  expect(result.state.trips?.[0].plans.map(p => p.id)).toEqual(['b', 'a'])
  expect(result.state.trips?.[0].plans.find(p => p.id === 'a')?.isCompleted).toBe(true)
})
it('holds a same-trip conflict while saving an independent trip and unrelated data', () => {
  const a = newTrip(details, 'mateo'), b = newTrip({ ...details, title: 'Other' }, 'seval')
  const result = rebaseSharedState({ trips: [a, b], monthlyIncome: 0 }, { trips: [{ ...a, title: 'Mine' }, { ...b, notes: 'Independent' }], monthlyIncome: 5 },
    { trips: [{ ...a, title: 'Partner' }, b], monthlyIncome: 0 }, new Set(['trips', 'monthlyIncome']))
  expect(result.groups).toHaveLength(1); expect(result.groups[0].members[0].recordId).toBe(a.id)
  expect(result.state.trips?.[0].title).toBe('Partner'); expect(result.visible.trips?.[0].title).toBe('Mine')
  expect(result.state.trips?.[1].notes).toBe('Independent'); expect(result.state.monthlyIncome).toBe(5)
})
it('does not resurrect a deleted trip from a stale clean cache; an edit/delete race needs review', () => {
  const trip = newTrip(details, 'mateo')
  expect(rebaseSharedState({ trips: [trip] }, { trips: [trip] }, { trips: [] }, new Set(['trips'])).state.trips).toEqual([])
  const result = rebaseSharedState({ trips: [trip] }, { trips: [{ ...trip, notes: 'Offline edit' }] }, { trips: [] }, new Set(['trips']))
  expect(result.state.trips).toEqual([]); expect(result.groups).toHaveLength(1)
  expect(result.visible.trips?.[0].notes).toBe('Offline edit')
})
