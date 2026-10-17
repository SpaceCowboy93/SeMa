import type {
  UserName, CalendarEvent, SharedTodo, FocusActivity,
  PartnerNote, MoodEntry, Countdown, SavingsGoal, ShoppingList,
} from '@/types'
import { OTHER_USER, USERS } from '@/types'
import { getWeekKey, formatTime, MOOD_CONFIG } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

export type BriefingItemKind =
  | 'todo_urgent'
  | 'event'
  | 'planner_activity'
  | 'partner_note'
  | 'partner_mood'
  | 'countdown'
  | 'savings_goal'
  | 'shopping_list'

export interface BriefingItem {
  id: string
  kind: BriefingItemKind
  emoji: string
  label: string
  sub?: string
  /** ID of the source record — used for routing to the original item */
  sourceId: string
}

export interface BriefingState {
  events: CalendarEvent[]
  todos: SharedTodo[]
  focusActivities: FocusActivity[]
  partnerNotes: PartnerNote[]
  moods: MoodEntry[]
  countdowns: Countdown[]
  savingsGoals: SavingsGoal[]
  shoppingLists: ShoppingList[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROWS = 6

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Per-profile per-date localStorage key to track whether the briefing was shown. */
export function briefingStorageKey(userId: UserName, today: string): string {
  return `sema-briefing-${userId}-${today}`
}

/** Build a local-time Date from a YYYY-MM-DD string (avoids UTC-offset edge cases). */
function localDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Pure function — single source of truth for briefing content.
 * Returns up to MAX_ROWS items ordered by priority.
 */
export function generateBriefingItems(
  currentUser: UserName,
  state: BriefingState,
  today: string,
): BriefingItem[] {
  const items: BriefingItem[] = []
  const partner = OTHER_USER[currentUser]
  const partnerName = USERS[partner].displayName

  // Day index for today: Mon=0 … Sun=6
  const todayDate = localDate(today)
  const dayIndex  = (todayDate.getDay() + 6) % 7
  const weekKey   = getWeekKey(todayDate)

  // ── 1. Overdue / urgent todo (1 max) ──────────────────────────────────────
  const overdueTodo = state.todos
    .filter(t => !t.isCompleted && !!t.date && t.date < today)
    .sort((a, b) => a.date!.localeCompare(b.date!))[0]

  if (overdueTodo) {
    items.push({
      id:       `briefing-todo-${overdueTodo.id}`,
      kind:     'todo_urgent',
      emoji:    'warning',
      label:    overdueTodo.title,
      sub:      'Overdue plan — needs attention',
      sourceId: overdueTodo.id,
    })
  }

  // ── 2. Today's events (up to 2, timed first) ──────────────────────────────
  const todayEvents = state.events
    .filter(e => e.date === today)
    .sort((a, b) => {
      if (a.startTime && !b.startTime) return -1
      if (!a.startTime && b.startTime) return 1
      if (a.startTime && b.startTime) return a.startTime.localeCompare(b.startTime)
      return 0
    })

  for (const ev of todayEvents.slice(0, 2)) {
    if (items.length >= MAX_ROWS) break
    items.push({
      id:       `briefing-ev-${ev.id}`,
      kind:     'event',
      emoji:    ev.emoji ?? 'calendar',
      label:    ev.title,
      sub:      ev.startTime ? formatTime(ev.startTime) : 'Today',
      sourceId: ev.id,
    })
  }

  // ── 3. Today's planner activity (1 max) ───────────────────────────────────
  if (items.length < MAX_ROWS) {
    const activity = state.focusActivities.find(a =>
      a.weekKey === weekKey &&
      a.dayIndex === dayIndex &&
      !a.isCompleted &&
      (a.createdBy === currentUser || a.createdBy === 'both'),
    )
    if (activity) {
      items.push({
        id:       `briefing-act-${activity.id}`,
        kind:     'planner_activity',
        emoji:    'checklist',
        label:    activity.title,
        sub:      activity.time ? formatTime(activity.time) : "Today's plan",
        sourceId: activity.id,
      })
    }
  }

  // ── 4. Unread partner note (1 max) ────────────────────────────────────────
  if (items.length < MAX_ROWS) {
    const note = state.partnerNotes.find(n => n.to === currentUser && !n.isRead)
    if (note) {
      const preview = note.content.length > 50
        ? note.content.slice(0, 50) + '…'
        : note.content
      items.push({
        id:       `briefing-note-${note.id}`,
        kind:     'partner_note',
        emoji:    'note',
        label:    `Note from ${partnerName}`,
        sub:      preview,
        sourceId: note.id,
      })
    }
  }

  // ── 5. Partner's mood today (1 max) ───────────────────────────────────────
  if (items.length < MAX_ROWS) {
    const mood = state.moods.find(m => m.userId === partner && m.date === today)
    if (mood) {
      const cfg = MOOD_CONFIG[mood.mood]
      items.push({
        id:       `briefing-mood-${partner}-${today}`,
        kind:     'partner_mood',
        emoji:    mood.mood,
        label:    `${partnerName} is feeling ${cfg.label.toLowerCase()}`,
        sub:      mood.note,
        sourceId: `${partner}-${today}`,
      })
    }
  }

  // ── 6. Nearest future countdown (1 max) ───────────────────────────────────
  if (items.length < MAX_ROWS) {
    const countdown = state.countdowns
      .filter(c => c.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0]

    if (countdown) {
      const msPerDay = 1000 * 60 * 60 * 24
      const daysLeft = Math.round(
        (localDate(countdown.date).getTime() - todayDate.getTime()) / msPerDay,
      )
      items.push({
        id:       `briefing-cd-${countdown.id}`,
        kind:     'countdown',
        emoji:    countdown.emoji,
        label:    countdown.title,
        sub:      daysLeft === 0 ? 'Today!' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} away`,
        sourceId: countdown.id,
      })
    }
  }

  // ── 7. Active savings goal (highest % progress, 1 max) ────────────────────
  if (items.length < MAX_ROWS) {
    const activeGoal = state.savingsGoals
      .filter(g => g.savedAmount < g.targetAmount && g.targetAmount > 0)
      .sort((a, b) => (b.savedAmount / b.targetAmount) - (a.savedAmount / a.targetAmount))[0]

    if (activeGoal) {
      const pct = Math.round((activeGoal.savedAmount / activeGoal.targetAmount) * 100)
      items.push({
        id:       `briefing-goal-${activeGoal.id}`,
        kind:     'savings_goal',
        emoji:    activeGoal.emoji,
        label:    activeGoal.title,
        sub:      `${pct}% saved · €${activeGoal.savedAmount.toLocaleString()} of €${activeGoal.targetAmount.toLocaleString()}`,
        sourceId: activeGoal.id,
      })
    }
  }

  // ── 8. Shopping list due today (1 max) ────────────────────────────────────
  if (items.length < MAX_ROWS) {
    const shopList = state.shoppingLists.find(l => l.date === today && !l.isCompleted)
    if (shopList) {
      const remaining = shopList.items.filter(i => !i.isChecked).length
      items.push({
        id:       `briefing-shop-${shopList.id}`,
        kind:     'shopping_list',
        emoji:    'shopping',
        label:    shopList.name,
        sub:      `${remaining} item${remaining !== 1 ? 's' : ''} remaining`,
        sourceId: shopList.id,
      })
    }
  }

  return items.slice(0, MAX_ROWS)
}
