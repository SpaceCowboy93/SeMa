/**
 * Living Moments — contextual text that quietly adapts to what's happening
 * in the couple's life without being distracting.
 *
 * Single source of truth. Future pages (Planner, Trips, Daily Briefing,
 * AI assistant) should call getLivingMoment() rather than duplicate logic.
 *
 * Rules:
 *  - Never fake context. Only responds to real app data.
 *  - Never invents events.
 *  - Typography remains the hero — words change, nothing else.
 */
import type {
  CalendarEvent, Countdown, ShoppingList, SharedTodo, PartnerNote, UserName,
} from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LivingMoment {
  /** Replaces the plain date below the Home greeting. Empty string = show date as normal. */
  homeSubtitle: string
  /**
   * Planner page subtitle — shown below the Planner title.
   * Reflects the week's character without using kitchen/shopping copy.
   * Empty string = use the static default in the caller.
   */
  plannerSubtitle: string
  /**
   * Finances page subtitle — money, savings and future-planning copy only.
   * Empty string = use the static default in the caller.
   */
  financeSubtitle: string
  /**
   * Us page subtitle — relationship, memories and emotional copy only.
   * Empty string = use the static default in the caller.
   */
  usSubtitle: string
  /**
   * Shopping sheet eyebrow text — small line above the fixed Playfair title.
   * Default: "Shopping together". Changes contextually when real app data matches a moment.
   * Passed as `shoppingTitle` prop to ShoppingHubSheet.
   */
  shoppingTitle: string
  /** Shopping sheet supporting subtitle / item count sentence. */
  shoppingSubtitle: string
}

export interface LivingMomentInput {
  events: CalendarEvent[]
  countdowns: Countdown[]
  shoppingLists: ShoppingList[]
  todos: SharedTodo[]
  partnerNotes: PartnerNote[]
  currentUser: UserName
  today: string // YYYY-MM-DD
}

// ── Keyword sets ──────────────────────────────────────────────────────────────

const TRAVEL_KW   = ['trip', 'flight', 'travel', 'vacation', 'holiday', 'airport', 'journey']
const BIRTHDAY_KW = ['birthday', 'bday', 'b-day']
const ANNIV_KW    = ['anniversary', 'anniv']
const DINNER_KW   = ['dinner', 'restaurant', 'reservation', 'dining']
const PICNIC_KW   = ['picnic']
const BBQ_KW      = ['bbq', 'barbecue', 'grill']
const MOVIE_KW    = ['movie', 'cinema', 'film']

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasKw(text: string, kw: string[]): boolean {
  const t = text.toLowerCase()
  return kw.some(k => t.includes(k))
}

/** Returns a YYYY-MM-DD string for the day after `today`. */
function dayAfter(today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, '0'),
    String(dt.getDate()).padStart(2, '0'),
  ].join('-')
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Pure function — derives a LivingMoment from the current app state.
 * Returns deterministic output for the same inputs.
 * Higher-priority checks win; first match is returned.
 */
export function getLivingMoment(input: LivingMomentInput): LivingMoment {
  const { events, countdowns, shoppingLists, todos, partnerNotes, currentUser, today } = input
  const tomorrow = dayAfter(today)
  const [, monthStr, dayStr] = today.split('-')
  const month = Number(monthStr)
  const day   = Number(dayStr)

  const incompleteLists = shoppingLists.filter(l => !l.isCompleted)
  const pendingCount    = incompleteLists.reduce(
    (a, l) => a + l.items.filter(i => !i.isChecked).length,
    0,
  )

  const defaultShoppingSubtitle = pendingCount === 0
    ? 'Everything is home.'
    : `${pendingCount} thing${pendingCount !== 1 ? 's' : ''} left to bring home.`

  const defaultShopping = {
    shoppingTitle:    'Shopping together',
    shoppingSubtitle: defaultShoppingSubtitle,
  }

  const todayEvents    = events.filter(e => e.date === today)
  const tomorrowEvents = events.filter(e => e.date === tomorrow)
  const todayCDs       = countdowns.filter(c => c.date === today)
  const tomorrowCDs    = countdowns.filter(c => c.date === tomorrow)

  // ── 1. Birthday today ──────────────────────────────────────────────────────
  if ([...todayEvents, ...todayCDs].some(e => hasKw(e.title, BIRTHDAY_KW))) {
    return {
      homeSubtitle:     '🎉 Today is a very special day.',
      plannerSubtitle:  'A special day to celebrate.',
      financeSubtitle:  'Saving for what matters.',
      usSubtitle:       'A day that belongs to your story.',
      shoppingTitle:    'A little celebration ahead',
      shoppingSubtitle: pendingCount > 0
        ? 'Everything needed for the special day.'
        : 'Ready for the celebration.',
    }
  }

  // ── 2. Anniversary today ───────────────────────────────────────────────────
  if ([...todayEvents, ...todayCDs].some(e => hasKw(e.title, ANNIV_KW))) {
    return {
      homeSubtitle:    '❤️ Happy anniversary.',
      plannerSubtitle: 'A day worth remembering.',
      financeSubtitle: 'Saving for what matters.',
      usSubtitle:      'Another year of your story.',
      ...defaultShopping,
    }
  }

  // ── 3. Vacation / trip starts today ───────────────────────────────────────
  if (todayEvents.some(e => hasKw(e.title, TRAVEL_KW))) {
    return {
      homeSubtitle:     '☀️ Time to make memories.',
      plannerSubtitle:  'Adventure begins today.',
      financeSubtitle:  'A good time to review your travel budget.',
      usSubtitle:       'A little closer to your next adventure.',
      shoppingTitle:    'Getting ready to go',
      shoppingSubtitle: pendingCount > 0
        ? `A few final things before the adventure.`
        : 'All packed.',
    }
  }

  // ── 4. Trip tomorrow ───────────────────────────────────────────────────────
  if ([...tomorrowEvents, ...tomorrowCDs].some(e => hasKw(e.title, TRAVEL_KW))) {
    return {
      homeSubtitle:     '✈️ Adventure starts tomorrow.',
      plannerSubtitle:  'A few plans before your next adventure.',
      financeSubtitle:  'A good time to review your travel budget.',
      usSubtitle:       'A little closer to your next adventure.',
      shoppingTitle:    'Getting ready to go',
      shoppingSubtitle: pendingCount > 0
        ? 'A few final things before the adventure.'
        : 'Almost packed.',
    }
  }

  // ── 5. Anniversary tomorrow ────────────────────────────────────────────────
  if ([...tomorrowEvents, ...tomorrowCDs].some(e => hasKw(e.title, ANNIV_KW))) {
    return {
      homeSubtitle:    '❤️ One more sleep until your anniversary.',
      plannerSubtitle: 'Tomorrow is a day to remember.',
      financeSubtitle: 'Saving for what matters.',
      usSubtitle:      'Tomorrow belongs to your story.',
      ...defaultShopping,
    }
  }

  // ── 6. Birthday tomorrow ───────────────────────────────────────────────────
  if ([...tomorrowEvents, ...tomorrowCDs].some(e => hasKw(e.title, BIRTHDAY_KW))) {
    return {
      homeSubtitle:     '🎂 A birthday is tomorrow.',
      plannerSubtitle:  'A celebration is coming up.',
      financeSubtitle:  'Saving for what matters.',
      usSubtitle:       'A memory worth keeping.',
      shoppingTitle:    'A little celebration ahead',
      shoppingSubtitle: pendingCount > 0
        ? 'Everything needed for the special day.'
        : 'Ready to celebrate.',
    }
  }

  // ── 7. Christmas week (Dec 22–26) ──────────────────────────────────────────
  if (month === 12 && day >= 22 && day <= 26) {
    return {
      homeSubtitle:     '🎄 Christmas is almost here.',
      plannerSubtitle:  'A festive week ahead.',
      financeSubtitle:  'A good time to review year-end spending.',
      usSubtitle:       'A memory worth keeping.',
      shoppingTitle:    'Gathering for Christmas',
      shoppingSubtitle: pendingCount > 0
        ? 'Just a few festive things left.'
        : 'Ready for Christmas.',
    }
  }

  // ── 8. New Year's Eve / Day ────────────────────────────────────────────────
  if ((month === 12 && day === 31) || (month === 1 && day === 1)) {
    return {
      homeSubtitle:    month === 12 ? '🥂 Tonight we celebrate.' : '✨ Happy New Year.',
      plannerSubtitle: month === 12 ? 'One last day of the year.' : 'A fresh start.',
      financeSubtitle: month === 12 ? 'A good time to review the year.' : 'A clean slate for your goals.',
      usSubtitle:      month === 12 ? 'Your story keeps growing.' : 'A new chapter begins.',
      ...defaultShopping,
    }
  }

  // ── 9. Dinner / restaurant event today or tomorrow ─────────────────────────
  const dinnerEvent = [...todayEvents, ...tomorrowEvents].find(e => hasKw(e.title, DINNER_KW))
  if (dinnerEvent) {
    const isToday = dinnerEvent.date === today
    return {
      homeSubtitle:     isToday ? '🍽️ Dinner plans tonight.' : '🍽️ Dinner plans tomorrow.',
      plannerSubtitle:  isToday ? 'Dinner plans in the schedule.' : 'Dinner plans tomorrow.',
      financeSubtitle:  'Another step toward your plans.',
      usSubtitle:       'Another day in your story.',
      shoppingTitle:    'Around the table',
      shoppingSubtitle: pendingCount > 0
        ? 'Everything for dinner together.'
        : 'Ready for dinner.',
    }
  }

  // ── 10. Picnic event today or tomorrow ─────────────────────────────────────
  if ([...todayEvents, ...tomorrowEvents].some(e => hasKw(e.title, PICNIC_KW))) {
    return {
      homeSubtitle:     '🌿 Picnic day ahead.',
      plannerSubtitle:  'A day outside together.',
      financeSubtitle:  'Quiet progress toward your goals.',
      usSubtitle:       'A memory worth keeping.',
      shoppingTitle:    'A day outside',
      shoppingSubtitle: pendingCount > 0 ? 'A few things to pack.' : 'All set for the picnic.',
    }
  }

  // ── 11. BBQ event today or tomorrow ───────────────────────────────────────
  if ([...todayEvents, ...tomorrowEvents].some(e => hasKw(e.title, BBQ_KW))) {
    return {
      homeSubtitle:     '🔥 BBQ weekend ahead.',
      plannerSubtitle:  'A relaxed day planned.',
      financeSubtitle:  'Quiet progress toward your goals.',
      usSubtitle:       'Another day in your story.',
      shoppingTitle:    'Around the grill',
      shoppingSubtitle: pendingCount > 0 ? 'A few things to grab.' : 'All set for the BBQ.',
    }
  }

  // ── 12. Movie night today or tomorrow ─────────────────────────────────────
  if ([...todayEvents, ...tomorrowEvents].some(e => hasKw(e.title, MOVIE_KW))) {
    return {
      homeSubtitle:     '🎬 Movie night ahead.',
      plannerSubtitle:  'A cosy evening in the schedule.',
      financeSubtitle:  'Another step toward your plans.',
      usSubtitle:       'Your story keeps growing.',
      shoppingTitle:    'Tonight at home',
      shoppingSubtitle: pendingCount > 0 ? 'Snacks and little comforts.' : 'All set for movie night.',
    }
  }

  // ── 13. Busy day (3+ items today) ─────────────────────────────────────────
  const todayTodos = todos.filter(t => !t.isCompleted && t.date === today)
  if (todayEvents.length + todayTodos.length >= 3) {
    return {
      homeSubtitle:    '📅 Busy day ahead.',
      plannerSubtitle: 'A full day, clearly arranged.',
      financeSubtitle: 'Steady progress this month.',
      usSubtitle:      'Another day in your story.',
      ...defaultShopping,
    }
  }

  // ── 14. Unread partner note ────────────────────────────────────────────────
  if (partnerNotes.some(n => n.to === currentUser && !n.isRead)) {
    return {
      homeSubtitle:    '💌 Someone left you a little surprise.',
      plannerSubtitle: 'A message is waiting for you.',
      financeSubtitle: 'Another step toward your plans.',
      usSubtitle:      'Your story keeps growing.',
      ...defaultShopping,
    }
  }

  // ── 15. Shopping lists pending ─────────────────────────────────────────────
  if (incompleteLists.length > 0) {
    return {
      homeSubtitle:    '🛒 Kitchen restock day.',
      plannerSubtitle: 'A few errands to fit into your week.',
      financeSubtitle: 'Another step toward your plans.',
      usSubtitle:      'Another day in your story.',
      ...defaultShopping,
    }
  }

  // ── 16. Quiet day — nothing scheduled ─────────────────────────────────────
  if (todayEvents.length === 0 && todayTodos.length === 0) {
    return {
      homeSubtitle:    '🌿 A calm day together.',
      plannerSubtitle: 'A calm week ahead.',
      financeSubtitle: 'A calm month, clearly understood.',
      usSubtitle:      'Another day in your story.',
      ...defaultShopping,
    }
  }

  // ── Default ────────────────────────────────────────────────────────────────
  return {
    homeSubtitle:    '',
    plannerSubtitle: '',
    financeSubtitle: '',
    usSubtitle:      '',
    ...defaultShopping,
  }
}
