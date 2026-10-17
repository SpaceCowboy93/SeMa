'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { mergeDraft, resolveDraftConflicts, type DraftConflict, type DraftResolutions } from '@/lib/draft-merge'
import { DraftConflictNotice } from '@/components/ui/DraftConflictNotice'
import type { Trip, TripCollection, TripDetails, TripPlanKind } from '@/types/trips'

export const inputClass = 'w-full min-w-0 rounded-xl border border-stone-300 bg-[#FFFEF9] px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-teal-500'
export const buttonClass = 'min-h-[44px] rounded-xl border border-stone-300 px-3 py-2 text-sm font-medium text-stone-800 disabled:opacity-40'
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1.5 text-sm text-stone-700"><span>{label}</span>{children}</label>
}
const detailsOf = (trip: Trip): TripDetails => ({ title: trip.title, destination: trip.destination, country: trip.country, startDate: trip.startDate,
  endDate: trip.endDate, travellers: trip.travellers, status: trip.status, budget: trip.budget, currency: trip.currency, notes: trip.notes })

export function TripDetailsEditor({ trip, onClose, onCreated }: { trip?: Trip; onClose: () => void; onCreated: (id: string) => void }) {
  const opening = useRef<TripDetails>(trip ? structuredClone(detailsOf(trip)) : { title: '', destination: '', country: '', startDate: undefined,
    endDate: undefined, travellers: ['mateo', 'seval'], status: 'idea', budget: 0, currency: 'EUR', notes: '' })
  const [draft, setDraft] = useState(opening.current)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<DraftConflict[]>([])
  const resolutions = useRef<DraftResolutions>({})
  const change = <K extends keyof TripDetails>(key: K, value: TripDetails[K]) => setDraft(d => ({ ...d, [key]: value }))
  function save(event?: FormEvent) {
    event?.preventDefault(); setError('')
    try {
      if (trip) {
        const latest = useAppStore.getState().trips.find(t => t.id === trip.id)
        if (!latest) { setError('This trip was removed. Your draft is still open; copy any notes before closing.'); return }
        const merged = mergeDraft(opening.current, draft, detailsOf(latest), resolutions.current)
        setConflicts(merged.conflicts); if (merged.conflicts.length) return
        if (Object.keys(merged.changes).length) useAppStore.getState().updateTrip(trip.id, merged.changes)
        onClose()
      } else {
        const id = useAppStore.getState().addTrip(draft)
        if (!id) { setError('Sign in before saving a trip.'); return }
        onCreated(id)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save the trip. Your draft is still open.') }
  }
  return <form onSubmit={save} aria-label={trip ? 'Edit trip' : 'New trip'} className="space-y-4 rounded-3xl border border-stone-200 bg-[#FFFEF9] p-4">
    <h2 className="text-lg font-semibold">{trip ? 'Edit trip' : 'A new adventure'}</h2>
    <Field label="Trip name"><input className={inputClass} required value={draft.title} onChange={e => change('title', e.target.value)} /></Field>
    <Field label="Destination"><input className={inputClass} value={draft.destination} onChange={e => change('destination', e.target.value)} /></Field>
    <Field label="Country"><input className={inputClass} value={draft.country} onChange={e => change('country', e.target.value)} /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Start date"><input type="date" className={inputClass} value={draft.startDate ?? ''} onChange={e => change('startDate', e.target.value || undefined)} /></Field>
      <Field label="End date"><input type="date" min={draft.startDate} className={inputClass} value={draft.endDate ?? ''} onChange={e => change('endDate', e.target.value || undefined)} /></Field>
    </div>
    <fieldset><legend className="mb-2 text-sm">Travellers</legend><div className="flex flex-wrap gap-4">{(['mateo', 'seval'] as const).map(user => <label key={user} className="flex min-h-[44px] items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.travellers.includes(user)} onChange={e => change('travellers', e.target.checked ? [...draft.travellers, user] : draft.travellers.filter(v => v !== user))} />{user === 'mateo' ? 'Mateo' : 'Seval'}
    </label>)}</div></fieldset>
    <Field label="Status"><select className={inputClass} value={draft.status} onChange={e => change('status', e.target.value as Trip['status'])}>{['idea', 'planning', 'booked', 'completed'].map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Total budget"><input className={inputClass} type="number" min="0" step="0.01" required value={draft.budget} onChange={e => change('budget', Number(e.target.value))} /></Field>
      <Field label="Currency"><input className={inputClass} maxLength={3} pattern="[A-Za-z]{3}" required value={draft.currency} onChange={e => change('currency', e.target.value.toUpperCase())} /></Field>
    </div>
    <Field label="General notes"><textarea className={inputClass} rows={4} value={draft.notes} onChange={e => change('notes', e.target.value)} /></Field>
    <DraftConflictNotice conflicts={conflicts} blockedPaths={['record']} onResolve={choice => { resolutions.current = resolveDraftConflicts(conflicts, choice); save() }} />
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className={buttonClass} type="submit">Save trip</button><button type="button" className={buttonClass} onClick={onClose}>Cancel</button></div>
  </form>
}

export type TripEntry = Trip[TripCollection][number]
export const planNames: Record<TripPlanKind, string> = { activity: 'Activity', transport: 'Flights & transport', accommodation: 'Accommodation', restaurant: 'Restaurant', place: 'Place to visit' }

export function TripEntryEditor({ tripId, collection, initial, isNew, onClose }: { tripId: string; collection: TripCollection; initial: TripEntry; isNew: boolean; onClose: () => void }) {
  const opening = useRef(structuredClone(initial) as unknown as Record<string, unknown>)
  const [draft, setDraft] = useState(opening.current)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<DraftConflict[]>([])
  const resolutions = useRef<DraftResolutions>({})
  const change = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }))
  const value = (key: string) => typeof draft[key] === 'string' || typeof draft[key] === 'number' ? String(draft[key]) : ''
  const planning = collection === 'plans', recommendation = collection === 'recommendations'
  function save(event?: FormEvent) {
    event?.preventDefault(); setError('')
    try {
      const trip = useAppStore.getState().trips.find(t => t.id === tripId)
      if (!trip) { setError('This trip was removed. Copy your draft before closing.'); return }
      const latest = trip[collection].find(item => item.id === initial.id)
      if (!isNew && !latest) { setError('This item was removed. Your draft has been kept.'); return }
      const result = isNew ? { merged: draft, conflicts: [] } : mergeDraft(opening.current, draft, latest as unknown as Record<string, unknown>, resolutions.current)
      setConflicts(result.conflicts); if (result.conflicts.length) return
      const entry = { ...result.merged, title: String(result.merged.title ?? '').trim() }
      const items = isNew ? [...trip[collection], entry] : trip[collection].map(item => item.id === initial.id ? entry : item)
      useAppStore.getState().updateTrip(tripId, { [collection]: items })
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Your draft is still open.') }
  }
  const textField = (key: string, label: string, type = 'text') => <Field label={label}><input className={inputClass} type={type} value={value(key)} onChange={e => change(key, ['date', 'time', 'endDate'].includes(key) ? e.target.value || undefined : e.target.value)} /></Field>
  const amountField = (key: string, label: string) => <Field label={label}><input type="number" min="0" step="0.01" className={inputClass} value={value(key)} onChange={e => change(key, e.target.value === '' ? undefined : Number(e.target.value))} /></Field>
  return <form onSubmit={save} aria-label="Trip item" className="space-y-4 rounded-3xl border border-stone-300 bg-[#FFFEF9] p-4">
    <h3 className="font-semibold">{isNew ? 'Add an item' : 'Edit item'}</h3>
    <Field label="Item name"><input className={inputClass} required value={value('title')} onChange={e => change('title', e.target.value)} /></Field>
    {planning && <><Field label="Type"><select className={inputClass} value={value('kind')} onChange={e => change('kind', e.target.value)}>{Object.entries(planNames).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></Field>
      {textField('date', 'Date', 'date')}{textField('time', 'Time', 'time')}{textField('endDate', 'End date', 'date')}</>}
    {recommendation && <><Field label="Category"><select className={inputClass} value={value('category')} onChange={e => change('category', e.target.value)}>{['food', 'activities', 'sightseeing', 'transport', 'practical'].map(c => <option key={c} value={c}>{c}</option>)}</select></Field>{textField('description', 'Description')}</>}
    {(planning || recommendation) && <>{textField('location', 'Location')}{textField('link', 'Booking or information link', 'url')}{amountField('estimatedCost', 'Estimated price')}</>}
    {(planning || collection === 'expenses') && amountField('actualCost', 'Actual spending')}
    {collection === 'expenses' && amountField('estimatedCost', 'Estimated spending')}
    {(planning || recommendation) && <Field label="Item notes"><textarea className={inputClass} rows={3} value={value('notes')} onChange={e => change('notes', e.target.value)} /></Field>}
    {collection === 'sharedNotes' && <Field label="Shared note"><textarea className={inputClass} rows={5} value={value('content')} onChange={e => change('content', e.target.value)} /></Field>}
    <DraftConflictNotice conflicts={conflicts} blockedPaths={['record']} onResolve={choice => { resolutions.current = resolveDraftConflicts(conflicts, choice); save() }} />
    {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap gap-2"><button className={buttonClass} type="submit">Save item</button><button className={buttonClass} type="button" onClick={onClose}>Cancel item</button></div>
  </form>
}
