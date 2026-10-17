import type { AppState } from '@/store/useAppStore'
import { isValidTrip } from './trips'

export const SHARED_KEYS = [
  'events', 'todos', 'moods', 'loveNotes', 'wishlistItems', 'countdowns', 'memories',
  'goals', 'partnerNotes', 'shoppingLists', 'monthlyIncome', 'budgetItems',
  'savingsGoals', 'financeMonths', 'savingsTransactions', 'focusActivities',
  'focusCarryOver', 'boomBoomCount', 'trips',
] as const satisfies readonly (keyof AppState)[]
export type SharedState = Pick<AppState, typeof SHARED_KEYS[number]>

function validGoalChecklist(goal: Record<string, unknown>): boolean {
  const titles = goal.checklist, items = goal.checklistItems
  if (titles !== undefined && (!Array.isArray(titles) || titles.some(title => typeof title !== 'string'))) return false
  if (items === undefined) return true
  if (!Array.isArray(items) || !items.every(item => item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.id === 'string' && typeof item.title === 'string' && typeof item.isCompleted === 'boolean')) return false
  if (new Set(items.map(item => item.id)).size !== items.length) return false
  return titles === undefined || (titles.length === items.length && items.every((item, index) => item.title === titles[index]))
}

/** Never import session identity, methods or UI state from JSON/cache/database. */
export function selectSharedState(value: unknown): Partial<SharedState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of SHARED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    const entry = source[key]
    if (key === 'monthlyIncome' || key === 'boomBoomCount') {
      if (typeof entry === 'number' && Number.isFinite(entry)) result[key] = entry
    } else if (key === 'focusCarryOver') {
      if (typeof entry === 'boolean') result[key] = entry
    } else if (Array.isArray(entry)) {
      if (key === 'trips') {
        if (entry.every(isValidTrip) && new Set(entry.map(trip => trip.id)).size === entry.length) result[key] = entry
        continue
      }
      if (key === 'moods') {
        if (entry.every(item => item && typeof item === 'object' && !Array.isArray(item) &&
          (item.userId === 'mateo' || item.userId === 'seval') &&
          typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
          Number.isFinite(Date.parse(item.date)) && new Date(item.date).toISOString().slice(0, 10) === item.date &&
          ['happy', 'relaxed', 'tired', 'sad', 'stressed'].includes(item.mood) &&
          (item.note === undefined || typeof item.note === 'string')) &&
          new Set(entry.map(item => JSON.stringify([item.userId, item.date]))).size === entry.length) result[key] = entry
        continue
      }
      const idKey = key === 'financeMonths' ? 'key' : 'id'
      if (entry.every(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item[idKey] === 'string' &&
        (key !== 'goals' || validGoalChecklist(item))) && new Set(entry.map(item => item[idKey])).size === entry.length) result[key] = entry
    }
  }
  return result as Partial<SharedState>
}

/** Reject a malformed remote snapshot before defaults can replace rejected fields. */
export function isValidRemoteSharedState(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const selected = selectSharedState(value)
  return SHARED_KEYS.every(key => !Object.prototype.hasOwnProperty.call(value, key) ||
    Object.prototype.hasOwnProperty.call(selected, key))
}
