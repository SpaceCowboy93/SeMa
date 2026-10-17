'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Plane } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { getAuthContext, isCurrentAuth } from '@/lib/auth-session'
import { generateId } from '@/lib/utils'
import { recommendationPlan, tripSpending } from '@/lib/trips'
import type { Trip, TripCollection, TripPlan, TripRecommendation } from '@/types/trips'
import { TripDetailsEditor, TripEntryEditor, buttonClass, planNames, type TripEntry } from './TripEditors'

const sectionNames: Record<TripCollection, string> = { plans: 'Itinerary & places', packing: 'Packing checklist', bookings: 'Booking checklist', sharedNotes: 'Shared notes', expenses: 'Other spending', recommendations: 'Saved recommendations' }
const sectionClass = 'rounded-3xl border border-stone-200 bg-[#FFFEF9] p-4'
function money(value: number, currency: string) { return new Intl.NumberFormat('en', { style: 'currency', currency }).format(value) }
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className={sectionClass}><h2 className="mb-4 text-[11px] font-medium uppercase tracking-widest text-stone-500">{title}</h2>{children}</section>
}
function blankEntry(collection: TripCollection): TripEntry {
  const base = { id: generateId(), title: '' }
  if (collection === 'plans') return { ...base, kind: 'activity', location: '', link: '', notes: '', isCompleted: false }
  if (collection === 'recommendations') return { ...base, category: 'food', description: '', location: '', link: '', notes: '' }
  if (collection === 'sharedNotes') return { ...base, content: '' }
  if (collection === 'expenses') return base
  return { ...base, isCompleted: false }
}

function TripDetail({ trip, onBack, onEdit }: { trip: Trip; onBack: () => void; onEdit: () => void }) {
  const [editing, setEditing] = useState<{ collection: TripCollection; entry: TripEntry; isNew: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const spending = tripSpending(trip)
  const update = useAppStore(s => s.updateTrip)
  function current() { return useAppStore.getState().trips.find(t => t.id === trip.id) }
  function remove(collection: TripCollection, id: string) { const latest = current(); if (latest) update(trip.id, { [collection]: latest[collection].filter(item => item.id !== id) }) }
  function toggle(collection: TripCollection, id: string) {
    const latest = current(); if (!latest) return
    update(trip.id, { [collection]: latest[collection].map(item => item.id === id && 'isCompleted' in item ? { ...item, isCompleted: !item.isCompleted } : item) })
  }
  function convert(rec: TripRecommendation) {
    const latest = current(); if (!latest || latest.plans.some(p => p.recommendationId === rec.id)) return
    update(trip.id, { plans: [...latest.plans, recommendationPlan(rec, latest.startDate)] })
    setMessage('Added to your itinerary. You can choose a date and time there.')
  }
  async function cover(file?: File) {
    if (!file) return
    const context = getAuthContext(); if (!context) { setMessage('Sign in to upload a cover photo.'); return }
    setUploading(true); setMessage('')
    try {
      const url = await useAppStore.getState().uploadPhoto(`trips/${trip.id}`, file)
      if (url && isCurrentAuth(context) && current()) update(trip.id, { coverPhoto: url })
      else setMessage('Photo upload is unavailable. Your trip is saved without a cover.')
    } finally { setUploading(false) }
  }
  function row(collection: TripCollection, item: TripEntry, index: number) {
    const plan = collection === 'plans' ? item as TripPlan : undefined
    const rec = collection === 'recommendations' ? item as TripRecommendation : undefined
    return <article key={item.id} className="min-w-0 rounded-2xl border border-stone-200 p-3">
      <div className="flex min-w-0 items-start gap-2">
        {'isCompleted' in item && <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={item.isCompleted} aria-label={`Complete ${item.title}`} onChange={() => toggle(collection, item.id)} />}
        <div className="min-w-0 flex-1 break-words"><h3 className="font-medium text-stone-800">{item.title}</h3>
          {plan && <><p className="mt-1 text-xs text-stone-500">{planNames[plan.kind]}{plan.time ? ` · ${plan.time}` : ''}{plan.endDate ? ` · until ${plan.endDate}` : ''}</p>{plan.location && <p className="mt-1 text-sm">{plan.location}</p>}{plan.notes && <p className="mt-2 whitespace-pre-wrap text-sm">{plan.notes}</p>}</>}
          {rec && <><p className="text-xs text-stone-500">{rec.category} · {rec.location}</p><p className="mt-2 whitespace-pre-wrap text-sm">{rec.description}</p><p className="whitespace-pre-wrap text-sm">{rec.notes}</p></>}
          {'content' in item && <p className="mt-2 whitespace-pre-wrap text-sm">{item.content}</p>}
          {'estimatedCost' in item && item.estimatedCost !== undefined && <p className="mt-1 text-xs">Estimated: {money(item.estimatedCost, trip.currency)}</p>}
          {'actualCost' in item && item.actualCost !== undefined && <p className="mt-1 text-xs">Actual: {money(item.actualCost, trip.currency)}</p>}
          {'link' in item && item.link && <a href={item.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[44px] items-center text-sm underline">Open link for {item.title}</a>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className={buttonClass} onClick={() => setEditing({ collection, entry: item, isNew: false })} aria-label={`Edit ${item.title}`}>Edit</button>
        <button className={buttonClass} onClick={() => remove(collection, item.id)} aria-label={`Delete ${item.title}`}>Delete</button>
        <button className={buttonClass} disabled={index === 0} aria-label={`Move ${item.title} up`} onClick={() => useAppStore.getState().moveTripEntry(trip.id, collection, item.id, -1)}>↑</button>
        <button className={buttonClass} disabled={index === trip[collection].length - 1} aria-label={`Move ${item.title} down`} onClick={() => useAppStore.getState().moveTripEntry(trip.id, collection, item.id, 1)}>↓</button>
        {rec && <button className={buttonClass} disabled={trip.plans.some(p => p.recommendationId === rec.id)} onClick={() => convert(rec)}>Add to itinerary</button>}
      </div>
    </article>
  }
  const plans = trip.plans.filter(p => planFilter === 'all' || p.kind === planFilter)
  const days = [...new Set(plans.map(p => p.date ?? 'Unscheduled'))].sort((a, b) => a === 'Unscheduled' ? 1 : b === 'Unscheduled' ? -1 : a.localeCompare(b))
  return <div className="space-y-5">
    <button className={buttonClass} onClick={onBack}>← All trips</button>
    <header className="space-y-3 break-words">
      {trip.coverPhoto && <Image src={trip.coverPhoto} alt={`Cover for ${trip.title}`} width={900} height={450} unoptimized className="h-44 w-full rounded-3xl object-cover" />}
      <h1 className="font-playfair text-2xl font-semibold text-[#2D2926]">{trip.title}</h1>
      <p className="text-sm text-stone-600">{[trip.destination, trip.country].filter(Boolean).join(', ') || 'Somewhere lovely'}</p>
      <p className="text-sm">{trip.startDate ?? 'Dates to come'}{trip.endDate ? ` – ${trip.endDate}` : ''} · {trip.status}</p>
      <p className="text-sm">Travelling: {trip.travellers.map(u => u === 'mateo' ? 'Mateo' : 'Seval').join(' & ') || 'Not decided yet'}</p>
      {trip.notes && <p className="whitespace-pre-wrap text-sm">{trip.notes}</p>}
      <button className={buttonClass} onClick={onEdit}>Edit trip details</button>
      <label className="block text-sm">Cover photo <input className="mt-2 block w-full min-w-0 text-xs" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" disabled={uploading} onChange={e => { void cover(e.target.files?.[0]); e.target.value = '' }} /></label>
      {trip.coverPhoto && <button className={buttonClass} onClick={() => update(trip.id, { coverPhoto: undefined })}>Remove cover</button>}
      {uploading && <p role="status">Uploading cover…</p>}{message && <p role="status" className="text-sm">{message}</p>}
    </header>
    <Section title="Our budget"><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt>Budget</dt><dd className="font-semibold">{money(trip.budget, trip.currency)}</dd></div><div><dt>Estimated</dt><dd>{money(spending.estimated, trip.currency)}</dd></div><div><dt>Actual</dt><dd>{money(spending.actual, trip.currency)}</dd></div><div><dt>Remaining</dt><dd>{money(trip.budget - spending.actual, trip.currency)}</dd></div></dl></Section>
    {editing && <TripEntryEditor key={`${editing.collection}:${editing.entry.id}`} tripId={trip.id} collection={editing.collection} initial={editing.entry} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    {(Object.keys(sectionNames) as TripCollection[]).map(collection => <Section key={collection} title={sectionNames[collection]}>
      {collection === 'plans' ? <><label className="mb-3 block text-sm">Show plans<select aria-label="Show plans" className="ml-2 max-w-full rounded-lg border border-stone-300 p-2" value={planFilter} onChange={e => setPlanFilter(e.target.value)}><option value="all">Day by day · all</option>{Object.entries(planNames).map(([kind, name]) => <option key={kind} value={kind}>{name}</option>)}</select></label>
        {days.map(day => <div key={day} className="mb-4 space-y-3"><h3 className="text-sm font-semibold">{day}</h3>{plans.filter(p => (p.date ?? 'Unscheduled') === day).map(p => row(collection, p, trip.plans.findIndex(entry => entry.id === p.id)))}</div>)}</>
        : <div className="space-y-3">{trip[collection].map((item, i) => row(collection, item, i))}</div>}
      {trip[collection].length === 0 && <p className="mb-3 text-sm text-stone-500">A little space for your plans.</p>}
      <button className={`${buttonClass} mt-3`} onClick={() => setEditing({ collection, entry: blankEntry(collection), isNew: true })}>Add to {sectionNames[collection].toLowerCase()}</button>
      {collection === 'recommendations' && <div className="mt-4 border-t border-stone-200 pt-4 text-sm text-stone-500"><p>Keep your own finds here. SeMa recommendations are coming later.</p><button className={`${buttonClass} mt-2`} disabled>Ask SeMa for recommendations · coming later</button></div>}
    </Section>)}
    {confirmDelete ? <div role="alert" className="space-y-3 rounded-2xl border border-red-200 p-4"><p>Delete this trip and everything in its plan?</p><button className={buttonClass} onClick={() => { useAppStore.getState().deleteTrip(trip.id); onBack() }}>Delete trip permanently</button><button className={`${buttonClass} ml-2`} onClick={() => setConfirmDelete(false)}>Keep trip</button></div>
      : <button className={buttonClass} onClick={() => setConfirmDelete(true)}>Delete trip</button>}
  </div>
}

export default function TripsPage() {
  const trips = useAppStore(s => s.trips)
  const [selected, setSelected] = useState<Trip | null>(null)
  const [editor, setEditor] = useState<{ kind: 'new' | 'edit'; snapshot?: Trip } | null>(null)
  const liveTrip = trips.find(t => t.id === selected?.id)
  // Keep an open draft readable if a partner removes its parent trip. Every
  // write rechecks the live store and refuses to recreate the deleted record.
  const trip = liveTrip ?? selected
  const open = (id: string) => { const next = useAppStore.getState().trips.find(t => t.id === id); if (next) setSelected(next) }
  return <div className="mx-auto w-full max-w-lg space-y-5 px-4 pb-10 pt-7 text-stone-700">
    {selected && !liveTrip && <p role="alert" className="text-sm text-amber-900">This trip was removed. Open drafts remain readable; they cannot restore it. Copy anything you need before going back.</p>}
    {editor ? <TripDetailsEditor key={editor.kind + (editor.snapshot?.id ?? '')} trip={editor.snapshot} onClose={() => setEditor(null)} onCreated={id => { open(id); setEditor(null) }} />
      : trip ? <TripDetail key={trip.id} trip={trip} onBack={() => setSelected(null)} onEdit={() => setEditor({ kind: 'edit', snapshot: trip })} />
        : <><header className="space-y-2"><Plane size={26} className="text-[#527052]" aria-hidden="true" /><h1 className="font-playfair text-2xl font-semibold text-[#2D2926]">Our trips</h1><p className="text-sm text-stone-500">Little escapes. Big adventures. Yours to dream up together.</p></header>
          <button className={buttonClass} onClick={() => setEditor({ kind: 'new' })}>Plan a trip</button>
          {!trips.length && <div className={`${sectionClass} space-y-2`}><h2 className="font-semibold">Where shall we go?</h2><p className="text-sm text-stone-500">Start with an idea. The dates and details can come later.</p></div>}
          {trips.map(t => <button key={t.id} onClick={() => open(t.id)} aria-label={`Open ${t.title}`} className={`${sectionClass} block w-full space-y-2 break-words text-left`}><h2 className="font-semibold text-stone-800">{t.title}</h2><p className="text-sm">{[t.destination, t.country].filter(Boolean).join(', ') || 'Destination to come'}</p><p className="text-xs text-stone-500">{t.startDate ?? 'Dates to come'} · {t.status}</p></button>)}</>}
  </div>
}
