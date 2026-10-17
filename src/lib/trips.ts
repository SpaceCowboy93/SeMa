import type { Trip, TripDetails, TripPlan, TripRecommendation } from '@/types/trips'
import type { UserName } from '@/types'
import { generateId } from './utils'

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown) => typeof v === 'string'
const title = (v: unknown) => typeof v === 'string' && v.trim().length > 0
const cost = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
const date = (v: unknown) => v === undefined || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v)
export function safeTripLink(value: string): boolean {
  if (!value) return true
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password } catch { return false }
}
function entries(v: unknown, check: (item: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(v) && v.every(item => object(item) && title(item.id) && title(item.title) && check(item)) && new Set(v.map(item => item.id)).size === v.length
}
export function isValidTrip(value: unknown): value is Trip {
  if (!object(value)) return false
  return title(value.id) && title(value.title) && text(value.destination) && text(value.country) && date(value.startDate) && date(value.endDate) &&
    (!value.startDate || !value.endDate || String(value.startDate) <= String(value.endDate)) &&
    Array.isArray(value.travellers) && value.travellers.every(v => v === 'mateo' || v === 'seval') && new Set(value.travellers).size === value.travellers.length &&
    ['idea', 'planning', 'booked', 'completed'].includes(String(value.status)) && typeof value.budget === 'number' && cost(value.budget) &&
    typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency) && text(value.notes) &&
    (value.coverPhoto === undefined || (typeof value.coverPhoto === 'string' && safeTripLink(value.coverPhoto))) &&
    (value.createdBy === 'mateo' || value.createdBy === 'seval') && text(value.createdAt) && text(value.updatedAt) &&
    entries(value.plans, p => ['activity', 'transport', 'accommodation', 'restaurant', 'place'].includes(String(p.kind)) && date(p.date) && date(p.endDate) &&
      (!p.date || !p.endDate || String(p.date) <= String(p.endDate)) && (p.time === undefined || (typeof p.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))) &&
      text(p.location) && typeof p.link === 'string' && safeTripLink(p.link) && text(p.notes) && cost(p.estimatedCost) && cost(p.actualCost) && typeof p.isCompleted === 'boolean') &&
    entries(value.packing, t => typeof t.isCompleted === 'boolean') && entries(value.bookings, t => typeof t.isCompleted === 'boolean') &&
    entries(value.sharedNotes, n => text(n.content)) && entries(value.expenses, e => cost(e.estimatedCost) && cost(e.actualCost)) &&
    entries(value.recommendations, r => ['food', 'activities', 'sightseeing', 'transport', 'practical'].includes(String(r.category)) &&
      text(r.description) && text(r.location) && typeof r.link === 'string' && safeTripLink(r.link) && cost(r.estimatedCost) && text(r.notes))
}
export function newTrip(details: TripDetails, user: UserName): Trip {
  const at = new Date().toISOString()
  const trip: Trip = { ...details, title: details.title.trim(), currency: details.currency.trim().toUpperCase(),
    startDate: details.startDate || undefined, endDate: details.endDate || undefined, id: generateId(), createdBy: user, createdAt: at, updatedAt: at,
    plans: [], packing: [], bookings: [], sharedNotes: [], expenses: [], recommendations: [] }
  if (!isValidTrip(trip)) throw new Error('Check the trip name, dates, currency and amounts.')
  return trip
}
export function tripSpending(trip: Trip) {
  return [...trip.plans, ...trip.expenses].reduce((total, entry) => ({ estimated: total.estimated + (entry.estimatedCost ?? 0), actual: total.actual + (entry.actualCost ?? 0) }), { estimated: 0, actual: 0 })
}
export function recommendationPlan(recommendation: TripRecommendation, date?: string): TripPlan {
  const kinds = { food: 'restaurant', activities: 'activity', sightseeing: 'place', transport: 'transport', practical: 'activity' } as const
  return { id: `recommendation:${recommendation.id}`, recommendationId: recommendation.id, title: recommendation.title, kind: kinds[recommendation.category],
    date, location: recommendation.location, link: recommendation.link, estimatedCost: recommendation.estimatedCost,
    notes: [recommendation.description, recommendation.notes].filter(Boolean).join('\n\n'), isCompleted: false }
}
