import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EventModal } from '@/components/calendar/EventModal'
import { CategoryHubSheet } from '@/components/ui/CategoryHub'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { clearActiveCouple, useAppStore } from '@/store/useAppStore'

beforeEach(() => { clearActiveCouple(); useAppStore.getState().setCurrentUser('mateo') })
function create() {
  return useAppStore.getState().addGoal('life', 'Trip', 'Original notes', '2027-06-01', 0, '10:00', [
    { id: 'pack', title: 'Pack', isCompleted: true }, { id: 'tickets', title: 'Tickets', isCompleted: false },
  ])
}
const click = async (element: HTMLElement) => { await act(async () => { fireEvent.click(element) }) }
function calendar(close = vi.fn()) {
  const event = useAppStore.getState().events[0]
  const rendered = render(<EventModal isOpen onClose={close} date={event.date} event={event} />)
  return { ...rendered, close, event }
}
async function dreams() {
  render(<CategoryHubSheet type="dreams" primary="#60a5fa" currentUser="mateo" onClose={() => {}} onEditMoment={() => {}} />)
  await click(screen.getByRole('button', { name: /Trip Original notes/ }))
}

it('an unchanged Calendar save preserves checklist IDs/completion and does not update the store', async () => {
  create()
  const { close, event } = calendar()
  const listener = vi.fn(), unsubscribe = useAppStore.subscribe(listener)
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(listener).not.toHaveBeenCalled()
  expect(useAppStore.getState().events[0]).toBe(event)
  expect(useAppStore.getState().goals[0].checklistItems).toEqual(event.todos)
  expect(close).toHaveBeenCalledTimes(1)
  unsubscribe()
})

it('Calendar completion toggles and a pending item rename propagate with original IDs', async () => {
  create(); calendar()
  await click(screen.getByRole('button', { name: 'Mark "Tickets" done' }))
  await click(screen.getByText('Pack'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Checklist item text' }), { target: { value: 'Pack early' } })
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(useAppStore.getState().events[0].todos).toEqual([
    { id: 'pack', title: 'Pack early', isCompleted: true }, { id: 'tickets', title: 'Tickets', isCompleted: true },
  ])
  expect(useAppStore.getState().goals[0].checklistItems).toEqual(useAppStore.getState().events[0].todos)
})

it('Calendar deletion of every checklist item clears both sides and survives reopening', async () => {
  create()
  const rendered = calendar()
  await click(screen.getByRole('button', { name: 'Remove "Pack"' }))
  await click(screen.getByRole('button', { name: 'Remove "Tickets"' }))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(useAppStore.getState().goals[0].checklistItems).toEqual([])
  expect(useAppStore.getState().events[0].todos).toEqual([])
  rendered.unmount(); calendar()
  expect(screen.queryByText('Pack')).not.toBeInTheDocument()
})

it('Calendar merges a local title with newer partner notes and checklist additions', async () => {
  const id = create(); calendar()
  fireEvent.change(screen.getByPlaceholderText('Event title...'), { target: { value: 'Local title' } })
  act(() => useAppStore.getState().updateGoal(id, { notes: 'Partner notes', checklistItems: [
    ...useAppStore.getState().goals[0].checklistItems!, { id: 'partner', title: 'Hotel', isCompleted: false },
  ] }))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  const { events, goals } = useAppStore.getState()
  expect(events[0]).toMatchObject({ title: 'Local title', notes: 'Partner notes' })
  expect(events[0].todos?.map(item => item.id)).toEqual(['pack', 'tickets', 'partner'])
  expect(goals[0]).toMatchObject({ title: 'Local title', notes: 'Partner notes', checklistItems: events[0].todos })
})

it.each(['Keep my changes', 'Use latest changes'])('Calendar requires explicit same-field resolution: %s', async button => {
  const id = create(), close = vi.fn(); calendar(close)
  fireEvent.change(screen.getByPlaceholderText('Event title...'), { target: { value: 'My title' } })
  fireEvent.change(screen.getByPlaceholderText('Add notes...'), { target: { value: 'Local notes' } })
  act(() => useAppStore.getState().updateGoal(id, { title: 'Partner title' }))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Your draft: My title')
  expect(screen.getByRole('alert')).toHaveTextContent('Latest: Partner title')
  expect(close).not.toHaveBeenCalled()
  expect(useAppStore.getState().events[0].title).toBe('Partner title')
  await click(screen.getByRole('button', { name: button }))
  expect(useAppStore.getState().events[0]).toMatchObject({ title: button === 'Keep my changes' ? 'My title' : 'Partner title', notes: 'Local notes' })
  expect(useAppStore.getState().goals[0].title).toBe(useAppStore.getState().events[0].title)
  expect(close).toHaveBeenCalledTimes(1)
})

it('Calendar rechecks a reviewed resolution if the partner changes again', async () => {
  const id = create(), close = vi.fn(); calendar(close)
  fireEvent.change(screen.getByPlaceholderText('Event title...'), { target: { value: 'Mine' } })
  act(() => useAppStore.getState().updateGoal(id, { title: 'First partner version' }))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  act(() => useAppStore.getState().updateGoal(id, { title: 'Second partner version' }))
  await click(screen.getByRole('button', { name: 'Keep my changes' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Second partner version')
  expect(useAppStore.getState().events[0].title).toBe('Second partner version')
  expect(close).not.toHaveBeenCalled()
})

it('Calendar does not silently resurrect a record deleted while its draft is open', async () => {
  create(); const { event, close } = calendar()
  fireEvent.change(screen.getByPlaceholderText('Event title...'), { target: { value: 'My draft' } })
  act(() => useAppStore.getState().deleteEvent(event.id))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(screen.getByRole('alert')).toHaveTextContent('removed or relinked')
  expect(screen.getByPlaceholderText('Event title...')).toHaveValue('My draft')
  expect(useAppStore.getState().events).toEqual([])
  expect(close).not.toHaveBeenCalled()
})

it('Dream unchanged Save preserves completed items and does not update the store', async () => {
  create(); await dreams()
  const before = useAppStore.getState(), listener = vi.fn(), unsubscribe = useAppStore.subscribe(listener)
  await click(screen.getByRole('button', { name: 'Save' }))
  expect(useAppStore.getState()).toBe(before)
  expect(listener).not.toHaveBeenCalled()
  unsubscribe()
})

it('Dream saves typed-but-uncommitted additions, edits, toggles, and deletions to Calendar', async () => {
  create(); await dreams()
  const inputs = screen.getAllByRole('textbox', { name: 'Checklist item text' })
  fireEvent.change(inputs[0], { target: { value: 'Pack early' } })
  await click(screen.getByRole('button', { name: 'Mark "Pack early" not done' }))
  await click(screen.getByRole('button', { name: 'Remove "Tickets"' }))
  fireEvent.change(screen.getByPlaceholderText('Add item...'), { target: { value: 'Typed hotel' } })
  await click(screen.getByRole('button', { name: 'Save' }))
  const { goals, events } = useAppStore.getState()
  expect(goals[0].checklistItems?.[0]).toEqual({ id: 'pack', title: 'Pack early', isCompleted: false })
  expect(goals[0].checklist).toEqual(['Pack early', 'Typed hotel'])
  expect(events[0].todos).toEqual(goals[0].checklistItems)
})

it('Dream explicit clearing removes Calendar checklist without resurrecting old items', async () => {
  create(); await dreams()
  await click(screen.getByRole('button', { name: 'Remove "Pack"' }))
  await click(screen.getByRole('button', { name: 'Remove "Tickets"' }))
  await click(screen.getByRole('button', { name: 'Save' }))
  expect(useAppStore.getState().goals[0].checklistItems).toEqual([])
  expect(useAppStore.getState().events[0].todos).toEqual([])
})

it('Dream merges a local item rename with a Calendar completion toggle received during editing', async () => {
  create(); await dreams()
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Checklist item text' })[1], { target: { value: 'Tickets booked' } })
  act(() => useAppStore.getState().updateEvent(useAppStore.getState().events[0].id, { todos: [
    useAppStore.getState().events[0].todos![0], { id: 'tickets', title: 'Tickets', isCompleted: true },
  ] }))
  await click(screen.getByRole('button', { name: 'Save' }))
  expect(useAppStore.getState().events[0].todos?.[1]).toEqual({ id: 'tickets', title: 'Tickets booked', isCompleted: true })
  expect(useAppStore.getState().goals[0].checklistItems).toEqual(useAppStore.getState().events[0].todos)
})

it('Dream requires resolution when both users rename the same item, retaining an uncommitted addition once', async () => {
  create(); await dreams()
  fireEvent.change(screen.getAllByRole('textbox', { name: 'Checklist item text' })[0], { target: { value: 'My rename' } })
  fireEvent.change(screen.getByPlaceholderText('Add item...'), { target: { value: 'My new item' } })
  act(() => useAppStore.getState().updateEvent(useAppStore.getState().events[0].id, {
    todos: [{ id: 'pack', title: 'Partner rename', isCompleted: true }, useAppStore.getState().events[0].todos![1]],
  }))
  await click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('My rename')
  expect(screen.getByRole('alert')).toHaveTextContent('Partner rename')
  expect(useAppStore.getState().goals[0].checklist).toEqual(['Partner rename', 'Tickets'])
  await click(screen.getByRole('button', { name: 'Use latest changes' }))
  expect(useAppStore.getState().goals[0].checklist).toEqual(['Partner rename', 'Tickets', 'My new item'])
  expect(useAppStore.getState().events[0].todos).toEqual(useAppStore.getState().goals[0].checklistItems)
})

it('FullCreateSheet saves pending text and completed items to both sides without an Enter commit', async () => {
  render(<FullCreateSheet open onClose={() => {}} primary="#60a5fa" initialType="dream" initialDate="2027-06-01" />)
  fireEvent.change(await screen.findByPlaceholderText('What do you dream of?'), { target: { value: 'New Dream' } })
  const input = screen.getByPlaceholderText('Add item...')
  fireEvent.change(input, { target: { value: 'Committed' } }); fireEvent.keyDown(input, { key: 'Enter' })
  await click(screen.getByRole('button', { name: 'Mark "Committed" done' }))
  fireEvent.change(input, { target: { value: 'Typed pending' } })
  await click(screen.getByRole('button', { name: 'Save Dream' }))
  const { goals, events } = useAppStore.getState()
  expect(goals[0].checklist).toEqual(['Committed', 'Typed pending'])
  expect(goals[0].checklistItems?.[0].isCompleted).toBe(true)
  expect(events[0].todos).toEqual(goals[0].checklistItems)
})

it('FullCreateSheet commits an active item rename on Save', async () => {
  render(<FullCreateSheet open onClose={() => {}} primary="#60a5fa" initialType="dream" initialDate="2027-06-01" />)
  fireEvent.change(await screen.findByPlaceholderText('What do you dream of?'), { target: { value: 'New Dream' } })
  const input = screen.getByPlaceholderText('Add item...')
  fireEvent.change(input, { target: { value: 'Old text' } }); fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Old text' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Checklist item text' }), { target: { value: 'Edited pending' } })
  await click(screen.getByRole('button', { name: 'Save Dream' }))
  expect(useAppStore.getState().goals[0].checklist).toEqual(['Edited pending'])
  expect(useAppStore.getState().events[0].todos?.[0].title).toBe('Edited pending')
})

it('Calendar keeps an uncommitted linked checklist addition exactly once through conflict resolution', async () => {
  const id = create(); calendar()
  await click(screen.getByRole('button', { name: 'Remove "Pack"' }))
  fireEvent.change(screen.getByPlaceholderText('Add item...'), { target: { value: 'Typed hotel' } })
  act(() => useAppStore.getState().updateGoal(id, { checklistItems: [
    { id: 'pack', title: 'Partner rename', isCompleted: true }, useAppStore.getState().goals[0].checklistItems![1],
  ] }))
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(screen.getByRole('alert')).toHaveTextContent('Partner rename')
  expect(useAppStore.getState().goals[0].checklist).toEqual(['Partner rename', 'Tickets'])
  await click(screen.getByRole('button', { name: 'Keep my changes' }))
  expect(useAppStore.getState().goals[0].checklist).toEqual(['Tickets', 'Typed hotel'])
  expect(useAppStore.getState().events[0].todos).toEqual(useAppStore.getState().goals[0].checklistItems)
})

it('a changed Calendar date prop does not reset the open draft and merges the partner date', async () => {
  const id = create(), view = calendar()
  fireEvent.change(screen.getByPlaceholderText('Event title...'), { target: { value: 'My title' } })
  act(() => useAppStore.getState().updateGoal(id, { targetDate: '2027-06-02' }))
  const latest = useAppStore.getState().events[0]
  view.rerender(<EventModal isOpen onClose={view.close} date={latest.date} event={latest} />)
  expect(screen.getByPlaceholderText('Event title...')).toHaveValue('My title')
  await click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(useAppStore.getState().events[0]).toMatchObject({ title: 'My title', date: '2027-06-02' })
  expect(useAppStore.getState().goals[0].targetDate).toBe('2027-06-02')
})

it('Dream keeps its draft when its record is removed by the partner', async () => {
  const id = create(); await dreams()
  fireEvent.change(screen.getByPlaceholderText('Title...'), { target: { value: 'My draft' } })
  act(() => useAppStore.getState().deleteGoal(id))
  await click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('removed or relinked')
  expect(screen.getByPlaceholderText('Title...')).toHaveValue('My draft')
  expect(useAppStore.getState().goals).toEqual([])
  expect(useAppStore.getState().events).toEqual([])
})
