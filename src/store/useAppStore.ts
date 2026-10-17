'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { coupleStorage, pendingKeys, persistSyncCheckpoint, readSyncBase, setCacheScope, initializeDurableCache, enableCacheWrites } from '@/lib/durable-cache'
import { selectSharedState, type SharedState } from '@/lib/shared-state'
import { sameValue } from '@/lib/sync-merge'
import { goalChecklist, reconcileChecklist } from '@/lib/dream-checklist'
import { isValidTrip, newTrip } from '@/lib/trips'
import { usesSupabaseV2Cache } from '@/lib/shared-cache-scope'
import type { Trip, TripCollection, TripDetails } from '@/types/trips'
import type { CoupleAccess } from '@/lib/couple-access'
import { authenticatedFetch } from '@/lib/authenticated-fetch'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergePreferences,
} from '@/lib/notification-preferences'
import type { ActivityEntry } from '@/lib/activity-event'
import {
  type UserName, type CalendarEvent, type EventTodo, type SharedTodo, type MoodEntry,
  type LoveNote, type WishlistItem, type Countdown, type Memory,
  type MoodType, type WishlistCategory, type EventColor,
  type Goal, type GoalCategory, type PartnerNote,
  type ShoppingList, type ShoppingItem, type ShoppingListInput,
  type BudgetItem, type SavingsGoal, type FinanceCategoryItem,
  type FinanceMonth, type FinanceMonthReport, type SavingsTransaction,
  type FocusActivity, type FocusChecklistItem, type FocusReminder, type FocusPriority,
  OTHER_USER,
} from '@/types'

const DEFAULT_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'b1',  category: 'Housing / Rent',  emoji: '🏠', planned: 1200, actual: 0 },
  { id: 'b2',  category: 'Groceries',       emoji: '🛒', planned: 400,  actual: 0 },
  { id: 'b3',  category: 'Transport',       emoji: '🚗', planned: 200,  actual: 0 },
  { id: 'b4',  category: 'Utilities',       emoji: '⚡', planned: 150,  actual: 0 },
  { id: 'b5',  category: 'Subscriptions',   emoji: '📱', planned: 50,   actual: 0 },
  { id: 'b7',  category: 'Date Nights',     emoji: '🍽️', planned: 200,  actual: 0 },
  { id: 'b8',  category: 'Travel',          emoji: '✈️', planned: 300,  actual: 0 },
  { id: 'b9',  category: 'Weed',            emoji: '🌿', planned: 100,  actual: 0 },
  { id: 'b10', category: 'Shopping',        emoji: '🛍️', planned: 200,  actual: 0 },
  { id: 'b11', category: 'Other',           emoji: '❤️', planned: 100,  actual: 0 },
]
import { generateId, getTodayString } from '@/lib/utils'
import { getAuthContext, getAuthGeneration, isCurrentAuth } from '@/lib/auth-session'
import { toast } from '@/store/useToastStore'

function updateRecords<T extends { id: string }>(records: T[], id: string, update: (record: T) => T): T[] {
  const next = records.map(record => {
    if (record.id !== id) return record
    const candidate = update(record)
    return sameValue(candidate, record) ? record : candidate
  })
  return next.every((record, index) => record === records[index]) ? records : next
}

export interface AppState {
  trips: Trip[]
  addTrip: (details: TripDetails) => string
  updateTrip: (id: string, updates: Partial<Trip>) => void
  deleteTrip: (id: string) => void
  moveTripEntry: (id: string, collection: TripCollection, entryId: string, direction: -1 | 1) => void
  // Session
  currentUser: UserName | null
  setCurrentUser: (user: UserName | null) => void

  // Global overlay tracking (transient — not persisted)
  // Any full-screen sheet/modal should call openOverlay() on open and closeOverlay() on close.
  // The FAB hides whenever overlayCount > 0.
  overlayCount: number
  openOverlay: () => void
  closeOverlay: () => void

  // Events
  events: CalendarEvent[]
  addEvent: (data: Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt' | 'linkedTodoId'>) => string
  updateEvent: (id: string, updates: Partial<CalendarEvent>) => void
  deleteEvent: (id: string) => void
  uploadEventPhoto: (eventId: string, file: File) => Promise<void>

  // Todos
  todos: SharedTodo[]
  addTodo: (title: string, items?: string[], date?: string, color?: EventColor, notes?: string, startTime?: string) => string
  uploadTodoPhoto: (todoId: string, file: File) => Promise<void>
  updateTodo: (id: string, updates: Partial<SharedTodo>) => void
  toggleTodo: (id: string) => void
  deleteTodo: (id: string) => void

  // Moods
  moods: MoodEntry[]
  setMood: (mood: MoodType, note?: string) => void
  getMoodForUser: (userId: UserName, date?: string) => MoodEntry | undefined

  // Love Notes
  loveNotes: LoveNote[]
  addLoveNote: (content: string) => void
  deleteLoveNote: (id: string) => void
  togglePinNote: (id: string) => void

  // Wishlist
  wishlistItems: WishlistItem[]
  addWishlistItem: (title: string, category: WishlistCategory, notes?: string) => string
  toggleWishlistItem: (id: string) => void
  updateWishlistItem: (id: string, updates: Partial<import('@/types').WishlistItem>) => void
  deleteWishlistItem: (id: string) => void

  // Countdowns
  countdowns: Countdown[]
  addCountdown: (title: string, date: string, emoji: string) => void
  updateCountdown: (id: string, updates: Partial<Countdown>) => void
  deleteCountdown: (id: string) => void

  // Memories
  memories: Memory[]
  addMemory: (title: string, date: string, notes?: string, photos?: string[], category?: string, checklist?: string[]) => void
  updateMemory: (id: string, updates: Partial<Memory>) => void
  deleteMemory: (id: string) => void

  // Relationship stats
  boomBoomCount: number
  incrementBoomBoom: () => void
  setBoomBoom: (count: number) => void

  // Goals
  goals: Goal[]
  addGoal: (categoryId: GoalCategory, title: string, notes?: string, targetDate?: string, progressTarget?: number, startTime?: string, checklist?: string[] | EventTodo[]) => string
  updateGoal: (id: string, updates: Partial<Goal>) => void
  deleteGoal: (id: string) => void
  incrementGoalProgress: (id: string) => void

  // Partner Notes
  partnerNotes: PartnerNote[]
  sendPartnerNote: (content: string) => void
  markPartnerNoteRead: (id: string) => void

  // Shopping
  shoppingLists: ShoppingList[]
  createShoppingList: (data: ShoppingListInput) => string
  updateShoppingList: (id: string, updates: Partial<ShoppingList>) => void
  deleteShoppingList: (id: string) => void
  addShoppingItem: (listId: string, name: string, quantity?: number, notes?: string, price?: number, photo?: string) => void
  updateShoppingItem: (listId: string, itemId: string, updates: Partial<ShoppingItem>) => void
  toggleShoppingItem: (listId: string, itemId: string) => void
  deleteShoppingItem: (listId: string, itemId: string) => void

  // Finance (legacy — kept for backward compat)
  monthlyIncome: number
  budgetItems: BudgetItem[]
  savingsGoals: SavingsGoal[]
  setMonthlyIncome: (amount: number) => void
  updateBudgetItem: (id: string, updates: Partial<Omit<BudgetItem, 'id'>>) => void
  addBudgetItem: (item: Omit<BudgetItem, 'id'>) => void
  deleteBudgetItem: (id: string) => void
  addSavingsGoal: (data: Omit<SavingsGoal, 'id' | 'createdAt' | 'createdBy'>) => void
  updateSavingsGoal: (id: string, updates: Partial<SavingsGoal>) => void
  deleteSavingsGoal: (id: string) => void
  addToSavings: (id: string, amount: number) => void

  // Finance v2 — per-month budgets + savings ledger
  financeMonths: FinanceMonth[]
  savingsTransactions: SavingsTransaction[]
  createFinanceMonth: (key: string, copyFromKey?: string) => void
  updateFinanceMonth: (key: string, updates: Partial<Pick<FinanceMonth, 'income' | 'budgetItems' | 'isFinalized' | 'report'>>) => void
  deleteFinanceMonth: (key: string) => void
  addSavingsTransaction: (monthKey: string, amount: number, note?: string) => void
  deleteSavingsTransaction: (id: string) => void
  migrateFinanceData: () => void
  migrateCategories: () => void

  // Weekly Focus
  focusActivities: FocusActivity[]
  focusCarryOver: boolean
  addFocusActivity: (data: {
    weekKey: string; dayIndex: number; title: string
    time?: string; notes?: string
    checklist?: FocusChecklistItem[]; photos?: string[]
    reminder?: FocusReminder; reminders?: FocusReminder[]; priority?: FocusPriority
    owner?: UserName | 'both'
  }) => string
  updateFocusActivity: (id: string, updates: Partial<FocusActivity>) => void
  toggleFocusActivity: (id: string) => void
  deleteFocusActivity: (id: string) => void
  uploadFocusActivityPhoto: (id: string, file: File) => Promise<void>
  setFocusCarryOver: (enabled: boolean) => void
  carryOverToWeek: (fromWeekKey: string, toWeekKey: string) => void

  // Generic photo upload (returns public URL or null)
  uploadPhoto: (folder: string, file: File) => Promise<string | null>
  uploadGoalPhoto: (goalId: string, file: File) => Promise<void>
  uploadWishlistPhoto: (itemId: string, file: File) => Promise<void>

  // Activity Centre — user-scoped; NOT in SHARED_KEYS; not couple-synced
  // Persisted via src/lib/user-cache.ts (loaded by useActivityCachePersistence)
  activityEntries: import('@/lib/activity-event').ActivityEntry[]
  addActivityEntry: (entry: import('@/lib/activity-event').ActivityEntry) => void
  markActivityRead: (id: string) => void
  markAllActivitiesRead: () => void
  clearReadActivities: () => void

  // Notification preferences — user-scoped; NOT in SHARED_KEYS
  notificationPrefs: import('@/lib/notification-preferences').NotificationPreferences
  updateNotificationPrefs: (updates: Partial<import('@/lib/notification-preferences').NotificationPreferences>) => void
}

/* ── Shopping → Finance sync helper ──────────────────────────────────────────
 * Pure function: given the old and new ShoppingList state, returns updated
 * financeMonths and any patch to apply back onto the ShoppingList record
 * (financeItemId, financeMonthKey). Keeps the FinanceCategoryItem in the
 * Shopping budget category of the correct FinanceMonth in sync.
 * ─────────────────────────────────────────────────────────────────────────── */
function applyShoppingFinanceSync(
  financeMonths: FinanceMonth[],
  oldList: ShoppingList,
  newList: ShoppingList,
  now: string,
): { financeMonths: FinanceMonth[]; listPatch: Partial<ShoppingList> } {

  const listCost = (l: ShoppingList) =>
    l.items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0)

  const findShoppingLoc = (months: FinanceMonth[], key: string) => {
    const mi = months.findIndex(m => m.key === key)
    if (mi === -1) return null
    const bi = months[mi].budgetItems.findIndex(b => b.category === 'Shopping' || b.emoji === '🛍️')
    if (bi === -1) return null
    return { mi, bi }
  }

  const ensureMonth = (months: FinanceMonth[], key: string): FinanceMonth[] => {
    if (months.some(m => m.key === key)) return months
    return [...months, {
      key, income: 0,
      budgetItems: DEFAULT_BUDGET_ITEMS.map(b => ({ ...b, actual: 0 })),
      isFinalized: false, createdAt: now, updatedAt: now,
    }]
  }

  const removeFinItem = (months: FinanceMonth[], key: string, itemId: string) => {
    const loc = findShoppingLoc(months, key)
    if (!loc) return { months, oldContrib: 0 }
    const b = months[loc.mi].budgetItems[loc.bi]
    const linked = b.items?.find(i => i.id === itemId)
    const oldContrib = linked?.unitPrice ?? 0
    return {
      months: months.map((m, mi) => mi !== loc.mi ? m : {
        ...m, updatedAt: now,
        budgetItems: m.budgetItems.map((b2, bi) => bi !== loc.bi ? b2 : {
          ...b2,
          actual: Math.max(0, b2.actual - oldContrib),
          items: (b2.items ?? []).filter(i => i.id !== itemId),
        }),
      }),
      oldContrib,
    }
  }

  const addFinItem = (months: FinanceMonth[], key: string, list: ShoppingList, total: number) => {
    const m2 = ensureMonth(months, key)
    const loc = findShoppingLoc(m2, key)
    if (!loc) return { months: m2, itemId: '' }
    const itemId = generateId()
    const newItem: FinanceCategoryItem = {
      id: itemId, name: list.name, quantity: 1, unitPrice: total,
      note: list.storeName, isPaid: true, createdAt: now, updatedAt: now,
    }
    return {
      months: m2.map((m, mi) => mi !== loc.mi ? m : {
        ...m, updatedAt: now,
        budgetItems: m.budgetItems.map((b, bi) => bi !== loc.bi ? b : {
          ...b,
          actual: b.actual + total,
          items: [...(b.items ?? []), newItem],
        }),
      }),
      itemId,
    }
  }

  const wasCompleted  = oldList.isCompleted ?? false
  const nowCompleted  = newList.isCompleted ?? false

  // ── Case 1: newly completed ──
  if (!wasCompleted && nowCompleted) {
    const total = listCost(newList)
    if (total <= 0) return { financeMonths, listPatch: {} }
    const monthKey = (newList.completedAt ?? now).slice(0, 7)
    const { months, itemId } = addFinItem(financeMonths, monthKey, newList, total)
    if (!itemId) return { financeMonths, listPatch: {} }
    return { financeMonths: months, listPatch: { financeItemId: itemId, financeMonthKey: monthKey } }
  }

  // ── Case 2: un-completed ──
  if (wasCompleted && !nowCompleted) {
    if (!oldList.financeItemId || !oldList.financeMonthKey) {
      return { financeMonths, listPatch: { financeItemId: undefined, financeMonthKey: undefined } }
    }
    const { months } = removeFinItem(financeMonths, oldList.financeMonthKey, oldList.financeItemId)
    return { financeMonths: months, listPatch: { financeItemId: undefined, financeMonthKey: undefined } }
  }

  // ── Case 3: still completed — update existing link ──
  if (wasCompleted && nowCompleted && oldList.financeItemId && oldList.financeMonthKey) {
    const newTotal = listCost(newList)
    const newCompletedAt = newList.completedAt ?? oldList.completedAt ?? now
    const newMonthKey = newCompletedAt.slice(0, 7)

    if (newMonthKey !== oldList.financeMonthKey) {
      // Month changed → move entry
      const { months: m1 } = removeFinItem(financeMonths, oldList.financeMonthKey, oldList.financeItemId)
      if (newTotal <= 0) return { financeMonths: m1, listPatch: { financeItemId: undefined, financeMonthKey: newMonthKey } }
      const { months: m2, itemId } = addFinItem(m1, newMonthKey, newList, newTotal)
      return { financeMonths: m2, listPatch: { financeItemId: itemId || undefined, financeMonthKey: newMonthKey } }
    }

    // Same month — update in-place
    const loc = findShoppingLoc(financeMonths, oldList.financeMonthKey)
    if (!loc) return { financeMonths, listPatch: {} }
    const b = financeMonths[loc.mi].budgetItems[loc.bi]
    const linked = b.items?.find(i => i.id === oldList.financeItemId)
    const oldContrib = linked?.unitPrice ?? 0
    const delta = newTotal - oldContrib
    const updatedMonths = financeMonths.map((m, mi) => mi !== loc.mi ? m : {
      ...m, updatedAt: now,
      budgetItems: m.budgetItems.map((b2, bi) => bi !== loc.bi ? b2 : {
        ...b2,
        actual: Math.max(0, b2.actual + delta),
        items: (b2.items ?? []).map(i => i.id !== oldList.financeItemId ? i : {
          ...i, unitPrice: newTotal, name: newList.name, note: newList.storeName, updatedAt: now,
        }),
      }),
    })
    return { financeMonths: updatedMonths, listPatch: {} }
  }

  return { financeMonths, listPatch: {} }
}

export const useAppStore = create<AppState>()(
  persist<AppState, [], [], Partial<SharedState>>(
    (set, get) => ({
      // ── Session ─────────────────────────────────────────────────────────────
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

      // ── Overlay tracking (transient) ─────────────────────────────────────────
      overlayCount: 0,
      openOverlay:  () => set(s => ({ overlayCount: s.overlayCount + 1 })),
      closeOverlay: () => set(s => ({ overlayCount: Math.max(0, s.overlayCount - 1) })),

      // ── Events ──────────────────────────────────────────────────────────────
      events: [],
      trips: [],
      addTrip: details => {
        const user = get().currentUser
        if (!user) return ''
        const trip = newTrip(details, user)
        set(s => ({ trips: [...s.trips, trip] }))
        return trip.id
      },
      updateTrip: (id, updates) => set(s => ({ trips: updateRecords(s.trips, id, trip => {
        const next = { ...trip, ...updates, id: trip.id, createdBy: trip.createdBy, createdAt: trip.createdAt, updatedAt: trip.updatedAt }
        if (!isValidTrip(next)) throw new Error('Check the trip fields, dates, links and amounts.')
        return sameValue(next, trip) ? trip : { ...next, updatedAt: new Date().toISOString() }
      }) })),
      deleteTrip: id => set(s => ({ trips: s.trips.filter(trip => trip.id !== id) })),
      moveTripEntry: (id, collection, entryId, direction) => {
        const trip = get().trips.find(t => t.id === id)
        if (!trip) return
        const items = [...trip[collection]], from = items.findIndex(item => item.id === entryId), to = from + direction
        if (from < 0 || to < 0 || to >= items.length) return
        ;[items[from], items[to]] = [items[to], items[from]]
        get().updateTrip(id, { [collection]: items })
      },

      addEvent: data => {
        const now = new Date().toISOString()
        const eventId = generateId()

        const newEvent: CalendarEvent = {
          ...data,
          id: eventId,
          createdAt: now,
          updatedAt: now,
        }

        set(s => ({ events: [...s.events, newEvent] }))
        return eventId
      },

      updateEvent: (id, updates) =>
        set(s => {
          const patch = { ...updates }
          if (patch.todos === undefined) delete patch.todos
          const event = s.events.find(e => e.id === id)
          if (!event) return s
          const next = { ...event, ...patch }
          const changed = !sameValue(event, next)
          const events = changed ? updateRecords(s.events, id, () => ({ ...next, updatedAt: new Date().toISOString() })) : s.events
          const todos = event.linkedTodoId ? updateRecords(s.todos, event.linkedTodoId, t => ({
            ...t,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.date !== undefined ? { date: patch.date } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
          })) : s.todos
          const goals = event.linkedGoalId ? updateRecords(s.goals, event.linkedGoalId, g => ({
            ...g,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.date !== undefined ? { targetDate: patch.date } : {}),
            ...('notes' in patch ? { notes: patch.notes || undefined } : {}),
            ...('startTime' in patch ? { startTime: patch.startTime || undefined } : {}),
            ...('photos' in patch ? { photos: patch.photos } : {}),
            ...('backgroundPhoto' in patch ? { backgroundPhoto: patch.backgroundPhoto } : {}),
            ...('todos' in patch ? { checklistItems: patch.todos, checklist: patch.todos!.map(t => t.title) } : {}),
            linkedEventId: id,
          })) : s.goals
          return events === s.events && todos === s.todos && goals === s.goals ? s : { events, todos, goals }
        }),

      deleteEvent: id =>
        set(s => {
          const event = s.events.find(e => e.id === id)
          return {
            events: s.events.filter(e => e.id !== id),
            todos:  event?.linkedTodoId
              ? s.todos.filter(t => t.id !== event.linkedTodoId)
              : s.todos,
            // Unlink goal but keep it — user may still want the goal without a date
            goals: event?.linkedGoalId
              ? s.goals.map(g =>
                  g.id === event.linkedGoalId
                    ? { ...g, linkedEventId: undefined, targetDate: undefined,
                        checklistItems: goalChecklist(g, event), checklist: goalChecklist(g, event).map(t => t.title) }
                    : g
                )
              : s.goals,
          }
        }),

      uploadEventPhoto: async (eventId, file) => {
        if (!file) return
        // uploadPhoto already shows a toast on failure
        const context = getAuthContext()
        const url = await get().uploadPhoto(`events/${eventId}`, file)
        if (!url || !context || !isCurrentAuth(context)) return
        const event = get().events.find(e => e.id === eventId)
        if (event) {
          const goal = get().goals.find(g => g.id === event.linkedGoalId)
          get().updateEvent(eventId, { photos: [...(event.photos ?? goal?.photos ?? []), url] })
        }
      },

      // ── Todos ───────────────────────────────────────────────────────────────
      todos: [],

      addTodo: (title, items, date, color, notes, startTime) => {
        const { currentUser } = get()
        if (!currentUser) return ''
        const now    = new Date().toISOString()
        const todoId = generateId()
        const validItems = items?.filter(i => i.trim())

        const newTodo: SharedTodo = {
          id: todoId,
          title,
          items: validItems?.length ? validItems : undefined,
          notes: notes?.trim() || undefined,
          isCompleted: false,
          createdBy: currentUser,
          createdAt: now,
          date,
          startTime: startTime || undefined,
          color,
        }

        if (date) {
          const eventId = generateId()
          newTodo.linkedEventId = eventId

          const newEvent: CalendarEvent = {
            id: eventId,
            title,
            date,
            color: color ?? (currentUser === 'mateo' ? 'blue' : 'seval'),
            createdBy: currentUser,
            createdAt: now,
            updatedAt: now,
            linkedTodoId: todoId,
          }

          set(s => ({
            todos:  [...s.todos,  newTodo],
            events: [...s.events, newEvent],
          }))
        } else {
          set(s => ({ todos: [...s.todos, newTodo] }))
        }
        return todoId
      },

      uploadTodoPhoto: async (todoId, file) => {
        const context = getAuthContext()
        const url = await get().uploadPhoto(`todos/${todoId}`, file)
        if (!url || !context || !isCurrentAuth(context)) return
        set(s => ({
          todos: s.todos.map(t =>
            t.id === todoId ? { ...t, photos: [...(t.photos ?? []), url] } : t
          ),
        }))
      },

      updateTodo: (id, updates) =>
        set(s => {
          const todo = s.todos.find(t => t.id === id)
          if (!todo) return {}
          const updatedTodo = { ...todo, ...updates }

          // If a date is now set but there was no linked event, we can't auto-create here
          // (no currentUser access in set). We just update the todo fields.
          // If there's a linked event, sync title/date/color to it.
          return {
            todos: s.todos.map(t => t.id === id ? updatedTodo : t),
            events: todo.linkedEventId
              ? s.events.map(e =>
                  e.id === todo.linkedEventId
                    ? {
                        ...e,
                        ...(updates.title !== undefined ? { title: updates.title } : {}),
                        ...(updates.date  !== undefined ? { date:  updates.date  } : {}),
                        ...(updates.color !== undefined ? { color: updates.color } : {}),
                        updatedAt: new Date().toISOString(),
                      }
                    : e
                )
              : s.events,
          }
        }),

      toggleTodo: id => {
        const { currentUser } = get()
        set(s => ({
          todos: s.todos.map(t =>
            t.id === id
              ? {
                  ...t,
                  isCompleted: !t.isCompleted,
                  completedBy: !t.isCompleted ? currentUser ?? undefined : undefined,
                }
              : t
          ),
        }))
      },

      deleteTodo: id =>
        set(s => {
          const todo = s.todos.find(t => t.id === id)
          return {
            todos:  s.todos.filter(t => t.id !== id),
            events: todo?.linkedEventId
              ? s.events.filter(e => e.id !== todo.linkedEventId)
              : s.events,
          }
        }),

      // ── Moods ───────────────────────────────────────────────────────────────
      moods: [],

      setMood: (mood, note) => {
        const { currentUser } = get()
        if (!currentUser) return
        const today = getTodayString()
        const entry: MoodEntry = { userId: currentUser, date: today, mood, note }
        set(s => ({
          moods: [
            ...s.moods.filter(m => !(m.userId === currentUser && m.date === today)),
            entry,
          ],
        }))
      },

      getMoodForUser: (userId, date) => {
        const target = date ?? getTodayString()
        return get().moods.find(m => m.userId === userId && m.date === target)
      },

      // ── Love Notes ──────────────────────────────────────────────────────────
      loveNotes: [],

      addLoveNote: content => {
        const { currentUser } = get()
        if (!currentUser) return
        set(s => ({
          loveNotes: [
            {
              id: generateId(),
              from: currentUser,
              content,
              createdAt: new Date().toISOString(),
              isPinned: false,
            },
            ...s.loveNotes,
          ],
        }))
      },

      deleteLoveNote: id =>
        set(s => ({ loveNotes: s.loveNotes.filter(n => n.id !== id) })),

      togglePinNote: id =>
        set(s => ({
          loveNotes: s.loveNotes.map(n => (n.id === id ? { ...n, isPinned: !n.isPinned } : n)),
        })),

      // ── Wishlist ─────────────────────────────────────────────────────────────
      wishlistItems: [],

      addWishlistItem: (title, category, notes) => {
        const { currentUser } = get()
        if (!currentUser) return ''
        const id = generateId()
        set(s => ({
          wishlistItems: [
            ...s.wishlistItems,
            {
              id,
              title,
              category,
              notes,
              isCompleted: false,
              createdBy: currentUser,
              createdAt: new Date().toISOString(),
            },
          ],
        }))
        return id
      },

      toggleWishlistItem: id =>
        set(s => ({
          wishlistItems: s.wishlistItems.map(i =>
            i.id === id ? { ...i, isCompleted: !i.isCompleted } : i
          ),
        })),

      updateWishlistItem: (id, updates) =>
        set(s => ({
          wishlistItems: s.wishlistItems.map(i => i.id === id ? { ...i, ...updates } : i),
        })),

      deleteWishlistItem: id =>
        set(s => ({ wishlistItems: s.wishlistItems.filter(i => i.id !== id) })),

      // ── Countdowns ───────────────────────────────────────────────────────────
      countdowns: [],

      addCountdown: (title, date, emoji) => {
        const { currentUser } = get()
        if (!currentUser) return
        set(s => ({
          countdowns: [
            ...s.countdowns,
            { id: generateId(), title, date, emoji, createdBy: currentUser },
          ],
        }))
      },

      updateCountdown: (id, updates) =>
        set(s => ({ countdowns: s.countdowns.map(c => c.id === id ? { ...c, ...updates } : c) })),

      deleteCountdown: id =>
        set(s => ({ countdowns: s.countdowns.filter(c => c.id !== id) })),

      // ── Memories ─────────────────────────────────────────────────────────────
      memories: [],

      addMemory: (title, date, notes, photos, category, checklist) => {
        const { currentUser } = get()
        if (!currentUser) return
        set(s => ({
          memories: [
            ...s.memories,
            {
              id: generateId(),
              title,
              date,
              notes,
              photos,
              category,
              checklist,
              createdBy: currentUser,
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      },

      updateMemory: (id, updates) =>
        set(s => ({
          memories: s.memories.map(m => (m.id === id ? { ...m, ...updates } : m)),
        })),

      deleteMemory: id =>
        set(s => ({ memories: s.memories.filter(m => m.id !== id) })),

      // ── Relationship stats ─────────────────────────────────────────────────────
      boomBoomCount: 0,
      incrementBoomBoom: () => set(s => ({ boomBoomCount: s.boomBoomCount + 1 })),
      setBoomBoom: (count) => set({ boomBoomCount: Math.max(0, count) }),

      // ── Goals ─────────────────────────────────────────────────────────────────
      goals: [],

      addGoal: (categoryId, title, notes, targetDate, progressTarget = 0, startTime, checklist) => {
        const { currentUser } = get()
        if (!currentUser) return ''
        const now    = new Date().toISOString()
        const goalId = generateId()
        const checklistItems = checklist?.map(item => typeof item === 'string'
          ? { id: generateId(), title: item, isCompleted: false } : item)

        const newGoal: Goal = {
          id: goalId,
          categoryId,
          title,
          notes,
          targetDate,
          startTime: startTime || undefined,
          checklist: checklistItems?.map(item => item.title),
          checklistItems,
          progressCurrent: 0,
          progressTarget,
          isCompleted: false,
          createdBy: currentUser,
          createdAt: now,
        }

        if (targetDate) {
          const eventId = generateId()
          newGoal.linkedEventId = eventId
          const newEvent: CalendarEvent = {
            id: eventId,
            title,
            date: targetDate,
            startTime: startTime || undefined,
            notes: notes || undefined,
            todos: checklistItems,
            color: currentUser === 'mateo' ? 'blue' : 'seval',
            createdBy: currentUser,
            createdAt: now,
            updatedAt: now,
            linkedGoalId: goalId,
          }
          set(s => ({
            goals:  [...s.goals,  newGoal],
            events: [...s.events, newEvent],
          }))
        } else {
          set(s => ({ goals: [...s.goals, newGoal] }))
        }
        return goalId
      },

      updateGoal: (id, updates) => {
        const { currentUser } = get()
        set(s => {
          const goal = s.goals.find(g => g.id === id)
          if (!goal) return s
          const linked = s.events.find(e => e.id === goal.linkedEventId && (!e.linkedGoalId || e.linkedGoalId === id))
            ?? s.events.find(e => e.linkedGoalId === id)
          const patch = { ...updates }
          // undefined is omission for checklists; [] is an intentional clear.
          if (patch.checklist === undefined) delete patch.checklist
          if (patch.checklistItems === undefined) delete patch.checklistItems
          const checklistChanged = 'checklistItems' in patch || 'checklist' in patch
          const items = patch.checklistItems ?? (patch.checklist !== undefined
            ? reconcileChecklist(patch.checklist, goalChecklist(goal, linked)) : goalChecklist(goal, linked))
          if (checklistChanged || ('targetDate' in patch && !patch.targetDate && linked)) {
            patch.checklistItems = items; patch.checklist = items.map(item => item.title)
          }
          if ('notes' in patch) patch.notes = patch.notes || undefined
          if ('startTime' in patch) patch.startTime = patch.startTime || undefined
          let nextGoal = { ...goal, ...patch }
          let events = s.events
          if ('targetDate' in patch && !patch.targetDate) {
            events = linked ? events.filter(e => e.id !== linked.id || (e.linkedGoalId && e.linkedGoalId !== id)) : events
            nextGoal = { ...nextGoal, linkedEventId: undefined }
          } else if (linked) {
            const synced: Partial<CalendarEvent> = {
              ...('title' in patch ? { title: patch.title } : {}),
              ...('targetDate' in patch ? { date: patch.targetDate } : {}),
              ...('notes' in patch ? { notes: patch.notes } : {}),
              ...('startTime' in patch ? { startTime: patch.startTime } : {}),
              ...('photos' in patch ? { photos: patch.photos } : {}),
              ...('backgroundPhoto' in patch ? { backgroundPhoto: patch.backgroundPhoto } : {}),
              ...(checklistChanged ? { todos: items } : {}), linkedGoalId: id,
            }
            events = updateRecords(events, linked.id, e => {
              const candidate = { ...e, ...synced }
              return sameValue(e, candidate) ? e : { ...candidate, updatedAt: new Date().toISOString() }
            })
            nextGoal = { ...nextGoal, linkedEventId: linked.id }
          } else if ('targetDate' in patch && patch.targetDate) {
            const eventId = generateId(), now = new Date().toISOString()
            events = [...events, {
              id: eventId, title: nextGoal.title, date: patch.targetDate,
              startTime: nextGoal.startTime, notes: nextGoal.notes, todos: items,
              photos: nextGoal.photos, backgroundPhoto: nextGoal.backgroundPhoto,
              color: (currentUser ?? goal.createdBy) === 'mateo' ? 'blue' : 'seval',
              createdBy: currentUser ?? goal.createdBy, createdAt: now, updatedAt: now, linkedGoalId: id,
            }]
            nextGoal = { ...nextGoal, linkedEventId: eventId, checklistItems: items, checklist: items.map(item => item.title) }
          }
          const goals = updateRecords(s.goals, id, () => nextGoal)
          return events === s.events && goals === s.goals ? s : { events, goals }
        })
      },

      deleteGoal: id =>
        set(s => {
          const goal = s.goals.find(g => g.id === id)
          return {
            goals:  s.goals.filter(g => g.id !== id),
            events: s.events.filter(e => e.linkedGoalId !== id && !(e.id === goal?.linkedEventId && !e.linkedGoalId)),
          }
        }),

      incrementGoalProgress: id =>
        set(s => ({
          goals: s.goals.map(g => {
            if (g.id !== id) return g
            const next = g.progressCurrent + 1
            return {
              ...g,
              progressCurrent: next,
              isCompleted: g.progressTarget > 0 ? next >= g.progressTarget : g.isCompleted,
            }
          }),
        })),

      // ── Partner Notes ─────────────────────────────────────────────────────────
      partnerNotes: [],

      sendPartnerNote: content => {
        const { currentUser } = get()
        if (!currentUser) return
        const note: PartnerNote = {
          id: generateId(),
          from: currentUser,
          to: OTHER_USER[currentUser],
          content: content.trim(),
          createdAt: new Date().toISOString(),
          isRead: false,
        }
        set(s => ({ partnerNotes: [...s.partnerNotes, note] }))
      },

      markPartnerNoteRead: id =>
        set(s => ({
          partnerNotes: s.partnerNotes.map(n =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        })),

      // ── Shopping ─────────────────────────────────────────────────────────────
      shoppingLists: [],

      createShoppingList: (data) => {
        const { currentUser } = get()
        if (!currentUser) return ''
        const now  = new Date().toISOString()
        const id   = generateId()
        set(s => ({
          shoppingLists: [
            ...s.shoppingLists,
            {
              id, name: data.name.trim(), items: [],
              createdBy: currentUser, createdAt: now, updatedAt: now,
              storeName:  data.storeName?.trim() || undefined,
              date:       data.date || undefined,
              time:       data.time || undefined,
              notes:      data.notes?.trim() || undefined,
              coverPhoto: data.coverPhoto || undefined,
              photos:     data.photos?.length ? data.photos : undefined,
              isCompleted: false,
            },
          ],
        }))
        return id
      },

      updateShoppingList: (id, updates) => {
        const now = new Date().toISOString()
        const s = get()
        const oldList = s.shoppingLists.find(l => l.id === id)
        if (!oldList) return
        const newList: ShoppingList = { ...oldList, ...updates, updatedAt: now }
        const { financeMonths, listPatch } = applyShoppingFinanceSync(s.financeMonths, oldList, newList, now)
        set(st => ({
          shoppingLists: st.shoppingLists.map(l => l.id === id ? { ...newList, ...listPatch } : l),
          financeMonths,
        }))
      },

      deleteShoppingList: id => {
        const now = new Date().toISOString()
        const s = get()
        const list = s.shoppingLists.find(l => l.id === id)
        let financeMonths = s.financeMonths
        if (list?.isCompleted && list.financeItemId && list.financeMonthKey) {
          const uncompleted = { ...list, isCompleted: false as const }
          financeMonths = applyShoppingFinanceSync(financeMonths, list, uncompleted, now).financeMonths
        }
        set(st => ({ shoppingLists: st.shoppingLists.filter(l => l.id !== id), financeMonths }))
      },

      updateShoppingItem: (listId, itemId, updates) => {
        const now = new Date().toISOString()
        const s = get()
        const oldList = s.shoppingLists.find(l => l.id === listId)
        if (!oldList) return
        const newList: ShoppingList = {
          ...oldList, updatedAt: now,
          items: oldList.items.map(i => i.id === itemId ? { ...i, ...updates } : i),
        }
        const { financeMonths, listPatch } = applyShoppingFinanceSync(s.financeMonths, oldList, newList, now)
        set(st => ({
          shoppingLists: st.shoppingLists.map(l => l.id === listId ? { ...newList, ...listPatch } : l),
          financeMonths,
        }))
      },

      addShoppingItem: (listId, name, quantity = 1, notes, price, photo) => {
        const now = new Date().toISOString()
        const s = get()
        if (!s.currentUser) return
        const oldList = s.shoppingLists.find(l => l.id === listId)
        if (!oldList) return
        const newItem: ShoppingItem = {
          id: generateId(), name: name.trim(), quantity, isChecked: false,
          createdAt: now,
          notes: notes?.trim() || undefined,
          price: price ?? undefined,
          photo: photo ?? undefined,
        }
        const newList: ShoppingList = { ...oldList, updatedAt: now, items: [...oldList.items, newItem] }
        const { financeMonths, listPatch } = applyShoppingFinanceSync(s.financeMonths, oldList, newList, now)
        set(st => ({
          shoppingLists: st.shoppingLists.map(l => l.id === listId ? { ...newList, ...listPatch } : l),
          financeMonths,
        }))
      },

      toggleShoppingItem: (listId, itemId) => {
        const now = new Date().toISOString()
        const s = get()
        if (!s.currentUser) return
        const oldList = s.shoppingLists.find(l => l.id === listId)
        if (!oldList) return
        const updatedItems = oldList.items.map(i =>
          i.id === itemId
            ? { ...i, isChecked: !i.isChecked, checkedBy: !i.isChecked ? s.currentUser! : undefined }
            : i
        )
        const allChecked = updatedItems.length > 0 && updatedItems.every(i => i.isChecked)
        const newList: ShoppingList = {
          ...oldList, updatedAt: now, items: updatedItems,
          isCompleted: allChecked,
          completedAt: allChecked
            ? (oldList.isCompleted && oldList.completedAt ? oldList.completedAt : now)
            : undefined,
          completedBy: allChecked ? s.currentUser! : undefined,
        }
        const { financeMonths, listPatch } = applyShoppingFinanceSync(s.financeMonths, oldList, newList, now)
        set(st => ({
          shoppingLists: st.shoppingLists.map(l => l.id === listId ? { ...newList, ...listPatch } : l),
          financeMonths,
        }))
      },

      deleteShoppingItem: (listId, itemId) => {
        const now = new Date().toISOString()
        const s = get()
        const oldList = s.shoppingLists.find(l => l.id === listId)
        if (!oldList) return
        const newList: ShoppingList = {
          ...oldList, updatedAt: now,
          items: oldList.items.filter(i => i.id !== itemId),
          // Un-complete when an item is removed
          isCompleted: false,
          completedAt: undefined,
        }
        const { financeMonths, listPatch } = applyShoppingFinanceSync(s.financeMonths, oldList, newList, now)
        set(st => ({
          shoppingLists: st.shoppingLists.map(l => l.id === listId ? { ...newList, ...listPatch } : l),
          financeMonths,
        }))
      },

      // ── Finance ──────────────────────────────────────────────────────────────
      monthlyIncome: 0,
      budgetItems: usesSupabaseV2Cache() ? [] : DEFAULT_BUDGET_ITEMS,
      savingsGoals: [],

      setMonthlyIncome: (amount) => set({ monthlyIncome: amount }),

      updateBudgetItem: (id, updates) =>
        set(s => ({
          budgetItems: s.budgetItems.map(b => b.id === id ? { ...b, ...updates } : b),
        })),

      addBudgetItem: (item) =>
        set(s => ({
          budgetItems: [...s.budgetItems, { ...item, id: generateId() }],
        })),

      deleteBudgetItem: (id) =>
        set(s => ({ budgetItems: s.budgetItems.filter(b => b.id !== id) })),

      addSavingsGoal: (data) => {
        const { currentUser } = get()
        if (!currentUser) return
        const goal: SavingsGoal = {
          ...data,
          id: generateId(),
          savedAmount: data.savedAmount ?? 0,
          createdBy: currentUser,
          createdAt: new Date().toISOString(),
        }
        set(s => ({ savingsGoals: [...s.savingsGoals, goal] }))
      },

      updateSavingsGoal: (id, updates) =>
        set(s => ({
          savingsGoals: s.savingsGoals.map(g => g.id === id ? { ...g, ...updates } : g),
        })),

      deleteSavingsGoal: (id) =>
        set(s => ({ savingsGoals: s.savingsGoals.filter(g => g.id !== id) })),

      addToSavings: (id, amount) =>
        set(s => ({
          savingsGoals: s.savingsGoals.map(g =>
            g.id === id ? { ...g, savedAmount: Math.max(0, g.savedAmount + amount) } : g
          ),
        })),

      // ── Finance v2 ───────────────────────────────────────────────────────────
      financeMonths: [],
      savingsTransactions: [],

      createFinanceMonth: (key, copyFromKey) => {
        const s = get()
        if (s.financeMonths.find(m => m.key === key)) return
        let income = 0
        let items: BudgetItem[] = DEFAULT_BUDGET_ITEMS.map(b => ({ ...b, actual: 0 }))
        if (copyFromKey) {
          const source = s.financeMonths.find(m => m.key === copyFromKey)
          if (source) {
            income = source.income
            items = source.budgetItems.map(b => ({ ...b, id: generateId(), actual: 0 }))
          }
        }
        const now = new Date().toISOString()
        set(s2 => ({
          financeMonths: [...s2.financeMonths, {
            key, income, budgetItems: items, isFinalized: false,
            createdAt: now, updatedAt: now,
          }],
        }))
      },

      updateFinanceMonth: (key, updates) =>
        set(s => ({
          financeMonths: s.financeMonths.map(m =>
            m.key === key ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
          ),
        })),

      deleteFinanceMonth: (key) =>
        set(s => ({
          financeMonths: s.financeMonths.filter(m => m.key !== key),
          savingsTransactions: s.savingsTransactions.filter(t => t.monthKey !== key),
        })),

      addSavingsTransaction: (monthKey, amount, note) => {
        const { currentUser } = get()
        if (!currentUser) return
        set(s => ({
          savingsTransactions: [...s.savingsTransactions, {
            id: generateId(), monthKey, amount,
            note: note?.trim() || undefined,
            createdAt: new Date().toISOString(),
            createdBy: currentUser,
          }],
        }))
      },

      deleteSavingsTransaction: (id) =>
        set(s => ({ savingsTransactions: s.savingsTransactions.filter(t => t.id !== id) })),

      migrateFinanceData: () => {
        const s = get()
        if (s.financeMonths.length > 0) return
        const hasData = s.monthlyIncome > 0 || s.budgetItems.some(b => b.actual > 0)
        if (!hasData) return
        const now = new Date()
        const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const timestamp = new Date().toISOString()
        const totalSaved = s.savingsGoals.reduce((a, g) => a + g.savedAmount, 0)
        const month: FinanceMonth = {
          key, income: s.monthlyIncome, budgetItems: s.budgetItems,
          isFinalized: false, createdAt: timestamp, updatedAt: timestamp,
        }
        const transactions: SavingsTransaction[] = totalSaved > 0 ? [{
          id: generateId(), monthKey: key, amount: totalSaved,
          note: 'Imported from savings goals',
          createdAt: timestamp, createdBy: s.currentUser ?? 'mateo',
        }] : []
        set({ financeMonths: [month], savingsTransactions: transactions })
      },

      migrateCategories: () => {
        const renamePets = (b: BudgetItem): BudgetItem =>
          b.category === 'Pets' ? { ...b, category: 'Weed', emoji: '🌿' } : b
        set(s => ({
          budgetItems: s.budgetItems.map(renamePets),
          financeMonths: s.financeMonths.map(m => ({
            ...m,
            budgetItems: m.budgetItems.map(renamePets),
          })),
        }))
      },

      // ── Weekly Focus ─────────────────────────────────────────────────────────
      focusActivities: [],
      focusCarryOver: true,

      addFocusActivity: (data) => {
        const { currentUser } = get()
        if (!currentUser) return ''
        const now = new Date().toISOString()
        const id = generateId()
        const activity: FocusActivity = {
          id,
          weekKey:     data.weekKey,
          dayIndex:    data.dayIndex,
          title:       data.title,
          time:        data.time,
          notes:       data.notes,
          checklist:   data.checklist,
          photos:      data.photos,
          isCompleted: false,
          createdBy:   data.owner ?? currentUser,
          createdAt:   now,
          updatedAt:   now,
          reminder:    data.reminder,
          reminders:   data.reminders,
          priority:    data.priority,
        }
        set(s => ({ focusActivities: [...s.focusActivities, activity] }))
        return id
      },

      updateFocusActivity: (id, updates) =>
        set(s => ({
          focusActivities: s.focusActivities.map(a =>
            a.id === id
              ? { ...a, ...updates, updatedAt: new Date().toISOString() }
              : a
          ),
        })),

      toggleFocusActivity: (id) =>
        set(s => ({
          focusActivities: s.focusActivities.map(a =>
            a.id === id
              ? { ...a, isCompleted: !a.isCompleted, updatedAt: new Date().toISOString() }
              : a
          ),
        })),

      deleteFocusActivity: (id) =>
        set(s => ({ focusActivities: s.focusActivities.filter(a => a.id !== id) })),

      uploadFocusActivityPhoto: async (id, file) => {
        const context = getAuthContext()
        const url = await get().uploadPhoto(`focus/${id}`, file)
        if (!url || !context || !isCurrentAuth(context)) return
        set(s => ({
          focusActivities: s.focusActivities.map(a =>
            a.id === id
              ? { ...a, photos: [...(a.photos ?? []), url], updatedAt: new Date().toISOString() }
              : a
          ),
        }))
      },

      setFocusCarryOver: (enabled) => set({ focusCarryOver: enabled }),

      carryOverToWeek: (fromWeekKey, toWeekKey) => {
        const now = new Date().toISOString()
        set(s => {
          const incomplete = s.focusActivities.filter(
            a => a.weekKey === fromWeekKey && !a.isCompleted
          )
          // Build a set of existing titles per day in the target week
          const existingKeys = new Set<string>()
          s.focusActivities
            .filter(a => a.weekKey === toWeekKey)
            .forEach(a => existingKeys.add(`${a.dayIndex}::${a.title.toLowerCase().trim()}`))

          const newActivities: FocusActivity[] = incomplete
            .filter(a => !existingKeys.has(`${a.dayIndex}::${a.title.toLowerCase().trim()}`))
            .map(a => ({
              ...a,
              id:        generateId(),
              weekKey:   toWeekKey,
              isCompleted: false,
              createdAt: now,
              updatedAt: now,
            }))

          return { focusActivities: [...s.focusActivities, ...newActivities] }
        })
      },

      // ── Generic upload helper ─────────────────────────────────────────────────
      uploadPhoto: async (folder, file) => {
        const context = getAuthContext()
        if (!context) return null
        // Pre-validate on the client to give instant feedback without a network round-trip
        const MAX_BYTES   = 5 * 1024 * 1024
        const VALID_TYPES = new Set([
          'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        ])
        if (file.size > MAX_BYTES) {
          const mb = (file.size / 1024 / 1024).toFixed(1)
          toast.error(`Photo is ${mb} MB — maximum is 5 MB.`)
          return null
        }
        const mimeType = file.type === 'image/jpg' ? 'image/jpeg' : (file.type || 'image/jpeg')
        if (!VALID_TYPES.has(mimeType)) {
          toast.error(`Unsupported file type "${file.type}". Use JPG, PNG, or WebP.`)
          return null
        }

        const form = new FormData()
        form.append('file', file)
        form.append('folder', folder)

        try {
          const res = await authenticatedFetch('/api/upload-photo', { method: 'POST', body: form })
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: 'Upload failed' }))
            const msg  = (body as { error?: string }).error ?? 'Upload failed'
            console.error('[Photo] Upload error:', msg, { folder, mimeType, size: file.size })
            toast.error(msg)
            return null
          }
          const { url } = await res.json() as { url: string }
          return isCurrentAuth(context) ? url : null
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Network error during upload'
          console.error('[Photo] Upload network error:', msg)
          toast.error('Photo upload failed — check your connection and try again.')
          return null
        }
      },

      uploadGoalPhoto: async (goalId, file) => {
        const context = getAuthContext()
        const url = await get().uploadPhoto(`goals/${goalId}`, file)
        if (!url || !context || !isCurrentAuth(context)) return
        const goal = get().goals.find(g => g.id === goalId)
        if (goal) get().updateGoal(goalId, { photos: [...(goal.photos ?? []), url] })
      },

      uploadWishlistPhoto: async (itemId, file) => {
        const context = getAuthContext()
        const url = await get().uploadPhoto(`wishes/${itemId}`, file)
        if (!url || !context || !isCurrentAuth(context)) return
        set(s => ({
          wishlistItems: s.wishlistItems.map(w =>
            w.id === itemId ? { ...w, photos: [...(w.photos ?? []), url] } : w
          ),
        }))
      },

      // ── Activity Centre — user-scoped; NOT in SHARED_KEYS; not couple-synced ──
      // Loaded from user-scoped localStorage by useActivityCachePersistence hook.
      activityEntries: [],
      addActivityEntry: (entry: ActivityEntry) => set(s => ({
        activityEntries: [entry, ...s.activityEntries].slice(0, 50),
      })),
      markActivityRead: (id: string) => set(s => ({
        activityEntries: s.activityEntries.map(e => e.id === id ? { ...e, isRead: true } : e),
      })),
      markAllActivitiesRead: () => set(s => ({
        activityEntries: s.activityEntries.map(e => ({ ...e, isRead: true })),
      })),
      clearReadActivities: () => set(s => ({
        activityEntries: s.activityEntries.filter(e => !e.isRead),
      })),

      // ── Notification preferences — user-scoped; NOT in SHARED_KEYS ──
      notificationPrefs: DEFAULT_NOTIFICATION_PREFERENCES,
      updateNotificationPrefs: (updates) => set(s => ({
        notificationPrefs: mergePreferences(s.notificationPrefs, updates),
      })),
    }),
    {
      name: 'semacalendar-v2',
      // The adapter binds this logical name to the backend + household. Never
      // hydrate the unscoped v1/v2 cache as a fallback on the new V2 project.
      storage: createJSONStorage<Partial<SharedState>>(() => coupleStorage),
      skipHydration: true,
      partialize: selectSharedState,
      merge: (saved, current) => ({ ...current, ...selectSharedState(saved) }),
    }
  )
)

let cacheLoad = 0
export function clearActiveCouple() {
  cacheLoad++
  setCacheScope(null)
  useAppStore.setState(useAppStore.getInitialState(), true)
}

export async function loadCoupleCache(access: CoupleAccess) {
  clearActiveCouple()
  const request = cacheLoad, generation = getAuthGeneration()
  await initializeDurableCache(access)
  if (request !== cacheLoad || generation !== getAuthGeneration()) return
  // Capture the atomic bundle before adding store defaults. Defaults are not
  // local edits and must not become pending merely because a cache was partial.
  const pending = pendingKeys(access)
  setCacheScope(access)
  // Only the verified in-memory IndexedDB view is exposed to Zustand hydration.
  const saved = coupleStorage.getItem('semacalendar-v2')
  let snapshot: Partial<SharedState> = {}
  // Database initialization already completed. This view is synchronous so it
  // cannot change global scope midway through reading the household snapshot.
  if (saved !== null && typeof saved !== 'string') throw new Error('Recovery requires synchronous cache storage')
  try { snapshot = selectSharedState(saved ? JSON.parse(saved).state : null) } catch { /* Raw bytes remain in quarantine. */ }
  const base = readSyncBase(access, snapshot)
  // A failed checkpoint remains visibly failed; the hook must retry it before
  // sending/acknowledging anything. Legacy localStorage is never rewritten.
  await persistSyncCheckpoint(access, snapshot, base, pending)
  if (request !== cacheLoad || generation !== getAuthGeneration()) return
  await useAppStore.persist.rehydrate()
  if (request === cacheLoad && generation === getAuthGeneration()) enableCacheWrites(selectSharedState(useAppStore.getState()))
}
