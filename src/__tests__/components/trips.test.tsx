import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { axe } from 'jest-axe'
import TripsPage from '@/components/trips/TripsPage'
import { clearActiveCouple, useAppStore } from '@/store/useAppStore'
import type { TripDetails } from '@/types/trips'

const details: TripDetails = { title: 'Porto together', destination: 'Porto', country: 'Portugal', travellers: ['mateo', 'seval'], status: 'planning', budget: 800, currency: 'EUR', notes: 'A quiet escape' }
beforeEach(() => { clearActiveCouple(); useAppStore.setState({ currentUser: 'mateo' }) })
function open() { const id = useAppStore.getState().addTrip(details); render(<TripsPage />); fireEvent.click(screen.getByRole('button', { name: 'Open Porto together' })); return id }
const change = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name), { target: { value } })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

it('creates a trip from the empty screen and clears optional details without restoring them', () => {
  render(<TripsPage />); click('Plan a trip'); change('Trip name', 'A new adventure'); change('Start date', '2027-05-01'); click('Save trip')
  expect(screen.getByRole('heading', { name: 'A new adventure' })).toBeInTheDocument()
  click('Edit trip details'); change('Start date', ''); change('Country', ''); change('General notes', ''); click('Save trip')
  expect(useAppStore.getState().trips[0]).toMatchObject({ country: '', notes: '' }); expect(useAppStore.getState().trips[0].startDate).toBeUndefined()
})
it('adds, completes, renames, reorders and deletes packing items with stable identity', () => {
  open(); click('Add to packing checklist'); change('Item name', 'Passport'); click('Save item')
  const id = useAppStore.getState().trips[0].packing[0].id
  fireEvent.click(screen.getByRole('checkbox', { name: 'Complete Passport' })); click('Edit Passport'); change('Item name', 'Passport and tickets'); click('Save item')
  expect(useAppStore.getState().trips[0].packing[0]).toMatchObject({ id, isCompleted: true, title: 'Passport and tickets' })
  click('Add to packing checklist'); change('Item name', 'Coat'); click('Save item'); click('Move Coat up')
  expect(useAppStore.getState().trips[0].packing.map(i => i.title)).toEqual(['Coat', 'Passport and tickets'])
  click('Delete Coat'); click('Delete Passport and tickets'); expect(useAppStore.getState().trips[0].packing).toEqual([])
})
it('saves all recommendation details, converts once, and retains them in the itinerary', () => {
  open(); click('Add to saved recommendations'); change('Item name', 'Dinner by the river'); change('Description', 'Try at sunset'); change('Location', 'Ribeira'); change('Booking or information link', 'https://example.com/dinner'); change('Estimated price', '40'); change('Item notes', 'Book outside'); click('Save item')
  click('Add to itinerary'); expect(screen.getByRole('button', { name: 'Add to itinerary' })).toBeDisabled()
  const trip = useAppStore.getState().trips[0]; expect(trip.plans).toHaveLength(1)
  expect(trip.plans[0]).toMatchObject({ kind: 'restaurant', title: 'Dinner by the river', estimatedCost: 40, notes: 'Try at sunset\n\nBook outside' })
  fireEvent.click(screen.getAllByRole('button', { name: 'Edit Dinner by the river' })[0])
  change('Date', '2027-05-01'); change('Actual spending', '0'); click('Save item')
  expect(useAppStore.getState().trips[0].plans[0]).toMatchObject({ date: '2027-05-01', actualCost: 0 })
})
it('merges a details draft with partner notes and requires explicit resolution for overlapping titles', () => {
  const id = open(); click('Edit trip details'); change('Trip name', 'My title')
  act(() => useAppStore.getState().updateTrip(id, { notes: 'Partner note', title: 'Partner title' }))
  click('Save trip'); expect(screen.getByRole('alert')).toHaveTextContent('Your partner changed')
  click('Keep my changes'); expect(useAppStore.getState().trips[0]).toMatchObject({ title: 'My title', notes: 'Partner note' })
})
it('keeps a draft readable when the partner deletes its trip and never recreates it on Save', () => {
  const id = open(); click('Edit trip details'); change('General notes', 'Keep my draft')
  act(() => useAppStore.getState().deleteTrip(id)); expect(screen.getByLabelText('General notes')).toHaveValue('Keep my draft')
  click('Save trip'); expect(useAppStore.getState().trips).toEqual([])
  expect(screen.getByText(/This trip was removed\. Your draft/)).toBeInTheDocument()
})
it('deletes a trip and its planning content through an explicit confirmation', () => {
  open(); click('Delete trip'); expect(useAppStore.getState().trips).toHaveLength(1)
  click('Delete trip permanently'); expect(useAppStore.getState().trips).toEqual([])
  expect(screen.getByRole('heading', { name: 'Where shall we go?' })).toBeInTheDocument()
})
it('provides labelled controls and keyboard access with no automatic accessibility violations', async () => {
  open(); click('Add to booking checklist'); const form = screen.getByRole('form', { name: 'Trip item' })
  expect(within(form).getByRole('textbox', { name: 'Item name' })).toBeInTheDocument()
  const user = userEvent.setup(); within(form).getByRole('textbox', { name: 'Item name' }).focus(); await user.tab()
  expect(within(form).getByRole('button', { name: 'Save item' })).toHaveFocus()
  expect((await axe(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })).violations).toEqual([])
})
