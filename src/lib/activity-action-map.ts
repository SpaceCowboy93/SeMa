/**
 * One notification per genuine user action, never for a remote pull or cache
 * rehydration. Only store actions are wrapped; useAppStore.setState used by
 * Supabase synchronization deliberately bypasses this wrapper.
 */
import { getAuthContext, isCurrentAuth } from '@/lib/auth-session'
import { createActivityEvent, type ActivityActionType, type ActivityEntityType } from '@/lib/activity-event'
import { enqueueActivityEvent } from '@/lib/activity-outbox'
import { sameValue } from '@/lib/sync-merge'
import type { UserName } from '@/types'

type ArrayKey = 'events'|'todos'|'goals'|'wishlistItems'|'shoppingLists'|'countdowns'|
  'memories'|'partnerNotes'|'loveNotes'|'moods'|'focusActivities'|'budgetItems'|
  'savingsGoals'|'financeMonths'|'savingsTransactions'
type ScalarKey = 'monthlyIncome'|'focusCarryOver'|'boomBoomCount'
type Key = ArrayKey | ScalarKey
type Spec = { key: Key; entity: ActivityEntityType; action: ActivityActionType }
const entry = (key: Key, entity: ActivityEntityType, action: ActivityActionType): Spec => ({key, entity, action})

/** Explicit allowlist of user interactions; sync and hydration are not actions. */
export const ACTIVITY_ACTIONS: Record<string, Spec> = {
  addEvent: entry('events','event','created'), updateEvent: entry('events','event','updated'),
  deleteEvent: entry('events','event','deleted'),
  uploadEventPhoto: entry('events','event','updated'),
  addTodo: entry('todos','todo','created'), updateTodo: entry('todos','todo','updated'),
  toggleTodo: entry('todos','todo','completed'), deleteTodo: entry('todos','todo','deleted'),
  uploadTodoPhoto: entry('todos','todo','updated'),
  setMood: entry('moods','mood','shared'),
  addLoveNote: entry('loveNotes','loveNote','sent'),
  deleteLoveNote: entry('loveNotes','loveNote','deleted'),
  togglePinNote: entry('loveNotes','loveNote','updated'),
  addWishlistItem: entry('wishlistItems','wish','created'),
  updateWishlistItem: entry('wishlistItems','wish','updated'),
  toggleWishlistItem: entry('wishlistItems','wish','achieved'),
  deleteWishlistItem: entry('wishlistItems','wish','deleted'),
  uploadWishlistPhoto: entry('wishlistItems','wish','updated'),
  addCountdown: entry('countdowns','countdown','created'),
  updateCountdown: entry('countdowns','countdown','updated'),
  deleteCountdown: entry('countdowns','countdown','deleted'),
  addMemory: entry('memories','memory','created'),
  updateMemory: entry('memories','memory','updated'),
  deleteMemory: entry('memories','memory','deleted'),
  addGoal: entry('goals','goal','created'), updateGoal: entry('goals','goal','updated'),
  incrementGoalProgress: entry('goals','goal','achieved'),
  deleteGoal: entry('goals','goal','deleted'),
  sendPartnerNote: entry('partnerNotes','partnerNote','sent'),
  createShoppingList: entry('shoppingLists','shopping','created'),
  updateShoppingList: entry('shoppingLists','shopping','updated'),
  deleteShoppingList: entry('shoppingLists','shopping','deleted'),
  addShoppingItem: entry('shoppingLists','shopping','added'),
  updateShoppingItem: entry('shoppingLists','shopping','updated'),
  toggleShoppingItem: entry('shoppingLists','shopping','updated'),
  deleteShoppingItem: entry('shoppingLists','shopping','deleted'),
  setMonthlyIncome: entry('monthlyIncome','finance','updated'),
  updateBudgetItem: entry('budgetItems','finance','updated'),
  addBudgetItem: entry('budgetItems','finance','created'),
  deleteBudgetItem: entry('budgetItems','finance','deleted'),
  addSavingsGoal: entry('savingsGoals','finance','created'),
  updateSavingsGoal: entry('savingsGoals','finance','updated'),
  deleteSavingsGoal: entry('savingsGoals','finance','deleted'),
  addToSavings: entry('savingsGoals','finance','added'),
  createFinanceMonth: entry('financeMonths','finance','created'),
  updateFinanceMonth: entry('financeMonths','finance','updated'),
  deleteFinanceMonth: entry('financeMonths','finance','deleted'),
  addSavingsTransaction: entry('savingsTransactions','finance','added'),
  deleteSavingsTransaction: entry('savingsTransactions','finance','deleted'),
  addFocusActivity: entry('focusActivities','focus','created'),
  updateFocusActivity: entry('focusActivities','focus','updated'),
  toggleFocusActivity: entry('focusActivities','focus','completed'),
  deleteFocusActivity: entry('focusActivities','focus','deleted'),
  uploadFocusActivityPhoto: entry('focusActivities','focus','updated'),
  setFocusCarryOver: entry('focusCarryOver','focus','updated'),
  carryOverToWeek: entry('focusActivities','focus','updated'),
  incrementBoomBoom: entry('boomBoomCount','countdown','updated'),
  setBoomBoom: entry('boomBoomCount','countdown','updated'),
}

type Identified = { id?: string; key?: string; title?: string; name?: string; content?: string;
  isCompleted?: boolean; isChecked?: boolean; mood?: string; date?: string; userId?: string }
function itemId(value: Identified, key: Key): string {
  if (key === 'moods') return String(value.userId) + ':' + String(value.date)
  return String(value.id ?? value.key ?? '')
}
export interface ChangeDescriptor {
  entityType: ActivityEntityType
  actionType: ActivityActionType
  entityId: string
  entityTitle: string
}

/** Pure diff of the *intended collection* before and after one local action. */
export function describeActivityChange(actionName: string, before: Record<string, unknown>,
  after: Record<string, unknown>): ChangeDescriptor | null {
  const spec = ACTIVITY_ACTIONS[actionName]
  if (!spec) return null
  const oldValue = before[spec.key], newValue = after[spec.key]
  if (sameValue(oldValue, newValue)) return null
  if (!Array.isArray(oldValue) || !Array.isArray(newValue)) {
    return {entityType: spec.entity, actionType: spec.action, entityId: spec.key, entityTitle: spec.entity}
  }
  const olds = new Map<string, Identified>((oldValue as Identified[]).map(x => [itemId(x,spec.key),x]))
  const news = new Map<string, Identified>((newValue as Identified[]).map(x => [itemId(x,spec.key),x]))
  const added = [...news].find(([id]) => !olds.has(id))
  const deleted = [...olds].find(([id]) => !news.has(id))
  const modified = [...news].find(([id, record]) => olds.has(id) && !sameValue(record, olds.get(id)))
  const pair = spec.action === 'deleted' ? deleted ?? modified : added ?? modified ?? deleted
  if (!pair || !pair[0]) return null
  const [id, record] = pair
  let actionType = spec.action
  if (actionName === 'toggleTodo' && !record.isCompleted) actionType = 'updated'
  if (actionName === 'toggleWishlistItem' && !record.isCompleted) actionType = 'updated'
  if (actionName === 'toggleFocusActivity' && !record.isCompleted) actionType = 'updated'
  if (actionName === 'incrementGoalProgress' && !record.isCompleted) actionType = 'updated'
  if (actionName === 'updateGoal' && record.isCompleted && !olds.get(id)?.isCompleted) actionType = 'achieved'
  if (actionName === 'updateShoppingList' && record.isCompleted && !olds.get(id)?.isCompleted) actionType = 'completed'
  if (spec.action === 'created' && !added) actionType = 'updated'
  return { entityType: spec.entity, actionType, entityId: id,
    entityTitle: record.title ?? record.name ?? spec.entity }
}

export function wrapActivityActions<T extends {currentUser: UserName|null}>(initial: T, get: () => T): T {
  const actions = initial as unknown as Record<string, unknown>
  for (const name of Object.keys(ACTIVITY_ACTIONS)) {
    const original = actions[name]
    if (typeof original !== 'function') continue
    actions[name] = (...args: unknown[]) => {
      const context = getAuthContext()
      // No activity emission during startup or when identity is uncertain.
      if (!context || context.userName !== get().currentUser) return original(...args)
      const before = get() as Record<string, unknown>
      const result = original(...args)
      const capture = () => {
        if (!isCurrentAuth(context) || get().currentUser !== context.userName) return
        const change = describeActivityChange(name, before, get() as Record<string, unknown>)
        if (!change) return
        const event = createActivityEvent({actor: context.userName, ...change})
        if (event) enqueueActivityEvent(context.userName, event)
      }
      // Photo uploads mutate the store after awaiting Storage; emit only on success.
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        return (result as Promise<unknown>).then(value => { capture(); return value })
      }
      capture()
      return result
    }
  }
  return initial
}
