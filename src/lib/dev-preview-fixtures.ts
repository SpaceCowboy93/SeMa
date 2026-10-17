/**
 * Dev-preview fixtures and cache helpers.
 *
 * DEVELOPMENT ONLY. Never imported by production code paths.
 *
 * Exports:
 *   isDevPreviewAllowed()       — guard: true only in NODE_ENV=development
 *   getDevPreviewFixtures(user) — realistic fake AppState (no real IDs/emails/photos)
 *   PREVIEW_CACHE_KEY           — localStorage key for preview state
 *   savePreviewState(state)     — write shared state to preview key only
 *   loadPreviewState()          — read from preview key only
 *   clearPreviewState()         — wipe preview key (triggers fresh seed on next load)
 *
 * Isolation guarantees:
 *   - Only ever reads/writes 'semacalendar-dev-preview-v1*' keys.
 *   - Never calls setCacheScope, supabase, or any authenticated API.
 *   - Never reads real couple-scoped keys ('semacalendar-v2:*').
 */

import type {
  CalendarEvent, SharedTodo, MoodEntry, LoveNote, WishlistItem,
  Countdown, Memory, Goal, PartnerNote, ShoppingList, ShoppingItem,
  BudgetItem, SavingsGoal, SavingsTransaction, FinanceMonth,
  FocusActivity, FocusChecklistItem,
  UserName,
} from '@/types'
import type { SharedState } from '@/lib/shared-state'
import type { ActivityEntry } from '@/lib/activity-event'

// ── Guard ─────────────────────────────────────────────────────────────────────

export function isDevPreviewAllowed(): boolean {
  return process.env.NODE_ENV === 'development'
}

// ── Cache key — completely isolated from real couple-scoped keys ──────────────

export const PREVIEW_CACHE_KEY = 'semacalendar-dev-preview-v1'
const PREVIEW_USER_KEY = 'semacalendar-dev-preview-v1:user'

export function savePreviewState(state: Partial<SharedState>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(state))
  } catch { /* quota or private mode — silently ignore */ }
}

export function loadPreviewState(): Partial<SharedState> | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREVIEW_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<SharedState>
  } catch { return null }
}

export function clearPreviewState(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(PREVIEW_CACHE_KEY)
}

export function savePreviewUser(user: UserName): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(PREVIEW_USER_KEY, user)
}

export function loadPreviewUser(): UserName {
  if (typeof localStorage === 'undefined') return 'mateo'
  const v = localStorage.getItem(PREVIEW_USER_KEY)
  return v === 'seval' ? 'seval' : 'mateo'
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function day(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

function ts(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

function weekKey(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  // ISO week number
  const jan4 = new Date(d.getFullYear(), 0, 4)
  const week = Math.ceil(((d.getTime() - jan4.getTime()) / 86400000 + jan4.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function monthKey(offset = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Fixture data ──────────────────────────────────────────────────────────────

const events: CalendarEvent[] = [
  {
    id: 'dp-event-1',
    title: 'Weekend brunch at Le Petit Café',
    date: day(1),
    startTime: '11:00',
    endTime: '13:00',
    notes: 'Book the corner table by the window — Seval loves that spot.',
    color: 'green',
    createdBy: 'mateo',
    createdAt: ts(-5),
    updatedAt: ts(-5),
    todos: [
      { id: 'dp-etodo-1a', title: 'Confirm reservation', isCompleted: true },
      { id: 'dp-etodo-1b', title: 'Pick up flowers on the way', isCompleted: false },
    ],
  },
  {
    id: 'dp-event-2',
    title: 'Movie night — The Grand Budapest Hotel',
    date: day(2),
    startTime: '20:30',
    notes: 'Popcorn: sweet for Seval, salted for Mateo. Do not forget the blanket.',
    color: 'seval',
    createdBy: 'seval',
    createdAt: ts(-3),
    updatedAt: ts(-3),
  },
  {
    id: 'dp-event-3',
    title: 'Morning run — 5 km loop through the park',
    date: day(3),
    startTime: '08:00',
    endTime: '09:00',
    color: 'blue',
    createdBy: 'mateo',
    createdAt: ts(-2),
    updatedAt: ts(-2),
  },
  {
    id: 'dp-event-4',
    title: 'Grocery & market run — fresh vegetables and herbs for the week',
    date: day(5),
    startTime: '15:00',
    color: 'yellow',
    notes: 'Farmers market closes at 17:00. Also check if we need olive oil.',
    createdBy: 'seval',
    createdAt: ts(-4),
    updatedAt: ts(-4),
    todos: [
      { id: 'dp-etodo-4a', title: 'Tomatoes and peppers', isCompleted: false },
      { id: 'dp-etodo-4b', title: 'Fresh herbs', isCompleted: false },
      { id: 'dp-etodo-4c', title: 'Cheese', isCompleted: false },
    ],
  },
  {
    id: 'dp-event-5',
    title: 'Lisbon trip planning session — flights, hotels, itinerary',
    date: day(14),
    startTime: '14:00',
    endTime: '16:00',
    notes: 'Look up Airbnb options in Alfama. Budget ≈ €900 total. Compare with hotels near Baixa.',
    color: 'green',
    createdBy: 'mateo',
    createdAt: ts(-1),
    updatedAt: ts(-1),
    linkedGoalId: 'dp-goal-1',
  },
  {
    id: 'dp-event-past-1',
    title: 'Seval\'s birthday dinner — La Maison Blanche',
    date: day(-7),
    startTime: '19:30',
    color: 'seval',
    notes: 'Ordered the tasting menu. Best evening in months.',
    createdBy: 'mateo',
    createdAt: ts(-14),
    updatedAt: ts(-8),
  },
]

const todos: SharedTodo[] = [
  {
    id: 'dp-todo-1',
    title: 'Pack for the weekend trip',
    items: ['Passport', 'Chargers', 'Sunscreen', 'Snacks for the train'],
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-2),
    date: day(6),
  },
  {
    id: 'dp-todo-2',
    title: 'Call the landlord about the heating — it has been off for three days',
    isCompleted: false,
    createdBy: 'seval',
    createdAt: ts(-1),
    notes: 'Try calling between 9 am and 11 am. Leave a voice message if no answer.',
  },
  {
    id: 'dp-todo-3',
    title: 'Plan anniversary dinner',
    items: [
      'Choose restaurant',
      'Make reservation',
      'Order flowers',
      'Write a card',
    ],
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-3),
    date: day(30),
    color: 'seval',
  },
  {
    id: 'dp-todo-4',
    title: 'Book dentist appointment',
    isCompleted: true,
    completedBy: 'seval',
    createdBy: 'seval',
    createdAt: ts(-10),
  },
  {
    id: 'dp-todo-5',
    title: 'Research the best hiking trails within 2 hours of the city for a day trip — bring a list of 3 options with elevation profiles',
    items: ['Trail A: Picos de Europa loop', 'Trail B: Serra da Estrela ridge', 'Trail C: Douro Valley viewpoint'],
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-4),
    color: 'blue',
  },
]

const moods: MoodEntry[] = [
  { userId: 'mateo', date: day(0),  mood: 'happy',   note: 'Had a great morning run.' },
  { userId: 'mateo', date: day(-1), mood: 'relaxed', note: '' },
  { userId: 'mateo', date: day(-2), mood: 'tired',   note: 'Long week at work.' },
  { userId: 'seval', date: day(0),  mood: 'happy',   note: 'Good day overall ✨' },
  { userId: 'seval', date: day(-1), mood: 'stressed', note: 'Deadline crunch.' },
  { userId: 'seval', date: day(-2), mood: 'relaxed', note: '' },
]

const loveNotes: LoveNote[] = [
  {
    id: 'dp-note-1',
    from: 'mateo',
    content: 'Thank you for always making our apartment feel like home. Every little thing you do — the candles, the playlists, the good morning coffees — means the world to me. 💙',
    createdAt: ts(-2),
    isPinned: true,
  },
  {
    id: 'dp-note-2',
    from: 'seval',
    content: 'You are my favourite adventure partner. Excited for Lisbon! 🌸',
    createdAt: ts(-5),
    isPinned: false,
  },
]

const wishlistItems: WishlistItem[] = [
  {
    id: 'dp-wish-1',
    title: 'Long weekend in Lisbon',
    category: 'travel',
    notes: 'Alfama neighbourhood, trams, pastel de nata. Book 2 months in advance for good prices.',
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-10),
  },
  {
    id: 'dp-wish-2',
    title: 'Try the new sushi omakase place downtown (Nori)',
    category: 'restaurant',
    notes: 'Takes reservations 3 weeks out. Check OpenTable on the 1st of each month.',
    isCompleted: false,
    createdBy: 'seval',
    createdAt: ts(-6),
  },
  {
    id: 'dp-wish-3',
    title: 'Wes Anderson movie marathon day — all 11 films, popcorn required',
    category: 'movie',
    isCompleted: true,
    createdBy: 'seval',
    createdAt: ts(-30),
  },
  {
    id: 'dp-wish-4',
    title: 'Escape room adventure — the one themed around an old library',
    category: 'date',
    notes: 'Book on a weekday evening for better availability and lower price.',
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-4),
  },
]

const countdowns: Countdown[] = [
  {
    id: 'dp-cd-1',
    title: "Seval's Birthday! 🎂",
    date: day(32),
    emoji: '🎉',
    createdBy: 'mateo',
    romanticMessage: 'Cannot wait to celebrate you.',
  },
  {
    id: 'dp-cd-2',
    title: 'Our Anniversary',
    date: day(58),
    emoji: '💍',
    createdBy: 'seval',
    notes: 'Two years and counting. Plan something special.',
    checklistEntries: [
      { text: 'Book restaurant', isCompleted: false },
      { text: 'Write letter', isCompleted: false },
      { text: 'Order gift', isCompleted: true },
    ],
  },
]

const memories: Memory[] = [
  {
    id: 'dp-mem-1',
    date: day(-180),
    title: 'Moving into our first apartment together',
    notes: 'Fourteen IKEA boxes, one broken shelf, two exhausted but happy humans. We ordered pizza on the floor surrounded by bubble wrap and it was perfect.',
    createdBy: 'mateo',
    createdAt: ts(-180),
    category: 'home',
  },
  {
    id: 'dp-mem-2',
    date: day(-60),
    title: 'Beach weekend at Comporta',
    notes: 'Three days of zero plans. Just sea, seafood and long walks. The sunset on day two was a painting.',
    createdBy: 'seval',
    createdAt: ts(-60),
    category: 'travel',
    checklist: ['Find the photo album', 'Print favourite shot', 'Write full journal entry'],
  },
]

const goals: Goal[] = [
  {
    id: 'dp-goal-1',
    categoryId: 'travel',
    title: 'Lisbon long weekend',
    notes: 'Flights, hotel or Airbnb in Alfama, day trip to Sintra. Budget: €900 total.',
    targetDate: day(90),
    progressCurrent: 1,
    progressTarget: 5,
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-7),
    linkedEventId: 'dp-event-5',
    checklist: ['Set budget', 'Search flights', 'Book accommodation', 'Plan itinerary', 'Pack light'],
  },
  {
    id: 'dp-goal-2',
    categoryId: 'fitness',
    title: 'Run a 10 km race together',
    notes: 'Training plan: 3 runs per week. Enter a local race in spring.',
    progressCurrent: 4,
    progressTarget: 12,
    isCompleted: false,
    createdBy: 'seval',
    createdAt: ts(-20),
  },
  {
    id: 'dp-goal-3',
    categoryId: 'learning',
    title: 'Read 12 books this year — one each month',
    progressCurrent: 8,
    progressTarget: 12,
    isCompleted: false,
    createdBy: 'mateo',
    createdAt: ts(-300),
  },
  {
    id: 'dp-goal-4',
    categoryId: 'hobbies',
    title: 'Take a pottery class together',
    progressCurrent: 0,
    progressTarget: 0,
    isCompleted: true,
    createdBy: 'seval',
    createdAt: ts(-90),
  },
]

const partnerNotes: PartnerNote[] = [
  {
    id: 'dp-pn-1',
    from: 'seval',
    to: 'mateo',
    content: 'Just wanted to say I am really proud of how hard you have been working. Remember to rest. I am making dinner tonight 🌸',
    createdAt: ts(-0.1),
    isRead: false,
  },
  {
    id: 'dp-pn-2',
    from: 'mateo',
    to: 'seval',
    content: 'Thinking of you! Left a surprise in the kitchen 💙',
    createdAt: ts(-2),
    isRead: true,
  },
  {
    id: 'dp-pn-3',
    from: 'seval',
    to: 'mateo',
    content: 'Found the surprise 😍 Best partner ever.',
    createdAt: ts(-1.8),
    isRead: true,
  },
]

const activeShoppingItems: ShoppingItem[] = [
  { id: 'dp-si-1a', name: 'Cherry tomatoes', quantity: 2, isChecked: false, createdAt: ts(-1), price: 2.50 },
  { id: 'dp-si-1b', name: 'Mozzarella di Bufala', quantity: 1, isChecked: false, createdAt: ts(-1), price: 4.80, notes: 'Get the good one from the deli counter' },
  { id: 'dp-si-1c', name: 'Sourdough bread', quantity: 1, isChecked: true, createdAt: ts(-1), price: 3.20 },
  { id: 'dp-si-1d', name: 'Fresh basil', quantity: 1, isChecked: true, createdAt: ts(-1), price: 1.50 },
  { id: 'dp-si-1e', name: 'Olive oil (extra virgin)', quantity: 1, isChecked: false, createdAt: ts(-1), price: 8.90 },
  { id: 'dp-si-1f', name: 'Sea salt flakes', quantity: 1, isChecked: false, createdAt: ts(-1), price: 3.60 },
]

const partyShoppingItems: ShoppingItem[] = [
  { id: 'dp-si-2a', name: 'Prosecco (3 bottles)', quantity: 3, isChecked: false, createdAt: ts(-2), price: 9.50 },
  { id: 'dp-si-2b', name: 'Balloons — gold and white', quantity: 1, isChecked: false, createdAt: ts(-2), price: 5.00 },
  { id: 'dp-si-2c', name: 'Birthday candles', quantity: 1, isChecked: true, createdAt: ts(-2) },
  { id: 'dp-si-2d', name: 'Paper plates and napkins', quantity: 2, isChecked: false, createdAt: ts(-2), price: 3.20 },
]

const completedShoppingItems: ShoppingItem[] = [
  { id: 'dp-si-3a', name: 'Charcoal (5 kg bag)', quantity: 1, isChecked: true, createdAt: ts(-14), price: 12.00 },
  { id: 'dp-si-3b', name: 'Chicken thighs', quantity: 8, isChecked: true, createdAt: ts(-14), price: 11.60 },
  { id: 'dp-si-3c', name: 'Corn on the cob', quantity: 4, isChecked: true, createdAt: ts(-14), price: 2.80 },
  { id: 'dp-si-3d', name: 'Burgers', quantity: 6, isChecked: true, createdAt: ts(-14), price: 9.50 },
  { id: 'dp-si-3e', name: 'Ketchup and mustard', quantity: 1, isChecked: true, createdAt: ts(-14), price: 3.80 },
]

const shoppingLists: ShoppingList[] = [
  {
    id: 'dp-list-1',
    name: 'Weekly groceries',
    items: activeShoppingItems,
    createdBy: 'mateo',
    createdAt: ts(-1),
    updatedAt: ts(-0.5),
    storeName: 'Mercadona',
  },
  {
    id: 'dp-list-2',
    name: "Seval's birthday party supplies",
    items: partyShoppingItems,
    createdBy: 'mateo',
    createdAt: ts(-2),
    updatedAt: ts(-2),
  },
  {
    id: 'dp-list-3',
    name: 'Summer BBQ',
    items: completedShoppingItems,
    createdBy: 'seval',
    createdAt: ts(-15),
    updatedAt: ts(-13),
    isCompleted: true,
    completedAt: ts(-13),
    completedBy: 'seval',
    storeName: 'Lidl',
  },
]

const focusChecklistItems: FocusChecklistItem[] = [
  { id: 'dp-fci-1', text: '10 minutes breathing', done: true },
  { id: 'dp-fci-2', text: 'Body scan', done: false },
  { id: 'dp-fci-3', text: 'Journal 3 things', done: false },
]

const focusActivities: FocusActivity[] = [
  {
    id: 'dp-fa-1',
    weekKey: weekKey(0),
    dayIndex: 0, // Monday
    title: 'Morning meditation',
    time: '07:30',
    notes: 'Use the Calm app, 10-minute session.',
    checklist: focusChecklistItems,
    isCompleted: false,
    priority: 'medium',
    reminders: ['5min'],
    createdBy: 'mateo',
    createdAt: ts(-3),
    updatedAt: ts(-1),
  },
  {
    id: 'dp-fa-2',
    weekKey: weekKey(0),
    dayIndex: 2, // Wednesday
    title: 'Spanish language exchange with Seval — 30 minutes conversation practice',
    time: '19:00',
    isCompleted: true,
    priority: 'low',
    reminders: [],
    createdBy: 'both',
    createdAt: ts(-7),
    updatedAt: ts(-5),
  },
  {
    id: 'dp-fa-3',
    weekKey: weekKey(0),
    dayIndex: 4, // Friday
    title: 'Cook a new recipe together',
    notes: 'Trying the Ottolenghi cauliflower dish from the book.',
    isCompleted: false,
    priority: 'high',
    reminders: ['1h'],
    createdBy: 'seval',
    createdAt: ts(-2),
    updatedAt: ts(-2),
  },
]

const budgetItems: BudgetItem[] = [
  { id: 'dp-b1',  category: 'Housing / Rent',   emoji: '🏠', planned: 1400, actual: 1400 },
  { id: 'dp-b2',  category: 'Groceries',        emoji: '🛒', planned: 400,  actual: 280 },
  { id: 'dp-b3',  category: 'Transport',        emoji: '🚇', planned: 150,  actual: 95 },
  { id: 'dp-b4',  category: 'Utilities',        emoji: '⚡', planned: 120,  actual: 110 },
  { id: 'dp-b5',  category: 'Date Nights',      emoji: '🍽️', planned: 300,  actual: 420 },
  { id: 'dp-b6',  category: 'Travel',           emoji: '✈️', planned: 200,  actual: 0 },
  { id: 'dp-b7',  category: 'Subscriptions',    emoji: '📱', planned: 60,   actual: 62 },
  { id: 'dp-b8',  category: 'Other / Personal', emoji: '🛍️', planned: 200,  actual: 130 },
]

const savingsGoals: SavingsGoal[] = [
  {
    id: 'dp-sg-1',
    title: 'Lisbon trip fund',
    emoji: '🏖️',
    targetAmount: 900,
    savedAmount: 420,
    deadline: day(90),
    notes: 'Contributing €150/month.',
    createdBy: 'mateo',
    createdAt: ts(-60),
  },
  {
    id: 'dp-sg-2',
    title: 'Emergency fund',
    emoji: '🛡️',
    targetAmount: 5000,
    savedAmount: 3200,
    createdBy: 'seval',
    createdAt: ts(-300),
  },
]

const savingsTransactions: SavingsTransaction[] = [
  { id: 'dp-st-1', monthKey: monthKey(-1), amount: 150, note: 'Monthly Lisbon contribution', createdAt: ts(-30), createdBy: 'mateo' },
  { id: 'dp-st-2', monthKey: monthKey(0),  amount: 150, note: 'Monthly Lisbon contribution', createdAt: ts(-2),  createdBy: 'mateo' },
  { id: 'dp-st-3', monthKey: monthKey(0),  amount: 100, note: 'Emergency fund top-up',       createdAt: ts(-5),  createdBy: 'seval' },
]

const financeMonths: FinanceMonth[] = [
  {
    key: monthKey(0),
    income: 3500,
    budgetItems,
    isFinalized: false,
    createdAt: ts(-28),
    updatedAt: ts(-1),
  },
]

// ── Activity entries — recipient-side feed shown to the logged-in user ────────
// These represent actions taken by the *other* user (e.g. seval) as seen by mateo.

function buildActivityEntries(viewerUser: UserName): ActivityEntry[] {
  const actor      = viewerUser === 'mateo' ? 'seval' : 'mateo'
  const actorEmoji = actor === 'seval' ? '💜' : '💚'

  return [
    {
      id:          `dp-act-1`,
      entityType:  'loveNote',
      actionType:  'sent',
      actorName:   actor,
      actorEmoji,
      safeBody:    `${actor === 'seval' ? 'Seval' : 'Mateo'} sent you a love note`,
      deepLink:    '/together',
      importance:  'immediate',
      createdAt:   new Date(Date.now() - 5 * 60_000).toISOString(),  // 5 min ago
      isRead:      false,
    },
    {
      id:          `dp-act-2`,
      entityType:  'shopping',
      actionType:  'added',
      actorName:   actor,
      actorEmoji,
      safeBody:    `${actor === 'seval' ? 'Seval' : 'Mateo'} added to shopping`,
      deepLink:    '/shopping',
      importance:  'grouped',
      createdAt:   new Date(Date.now() - 22 * 60_000).toISOString(), // 22 min ago
      isRead:      false,
      groupCount:  3,
    },
    {
      id:          `dp-act-3`,
      entityType:  'goal',
      actionType:  'created',
      actorName:   actor,
      actorEmoji,
      safeBody:    `${actor === 'seval' ? 'Seval' : 'Mateo'} added "Trip to Lisbon"`,
      deepLink:    '/goals',
      importance:  'immediate',
      createdAt:   new Date(Date.now() - 2 * 60 * 60_000).toISOString(), // 2h ago
      isRead:      true,
    },
    {
      id:          `dp-act-4`,
      entityType:  'todo',
      actionType:  'completed',
      actorName:   actor,
      actorEmoji,
      safeBody:    `${actor === 'seval' ? 'Seval' : 'Mateo'} completed "Book the corner table"`,
      deepLink:    '/planner',
      importance:  'immediate',
      createdAt:   new Date(Date.now() - 5 * 60 * 60_000).toISOString(), // 5h ago
      isRead:      true,
    },
    {
      id:          `dp-act-5`,
      entityType:  'mood',
      actionType:  'shared',
      actorName:   actor,
      actorEmoji,
      safeBody:    `${actor === 'seval' ? 'Seval' : 'Mateo'} shared their mood`,
      deepLink:    '/us',
      importance:  'immediate',
      createdAt:   new Date(Date.now() - 24 * 60 * 60_000).toISOString(), // yesterday
      isRead:      true,
    },
  ]
}

// ── Main fixture builder ───────────────────────────────────────────────────────

export function getDevPreviewFixtures(
  user: UserName,
): Partial<SharedState> & { currentUser: UserName; activityEntries: ActivityEntry[] } {
  return {
    currentUser: user,
    events,
    todos,
    moods,
    loveNotes,
    wishlistItems,
    countdowns,
    memories,
    goals,
    partnerNotes,
    shoppingLists,
    focusActivities,
    budgetItems,
    savingsGoals,
    savingsTransactions,
    financeMonths,
    monthlyIncome: 3500,
    focusCarryOver: false,
    boomBoomCount: 42,
    trips: [],
    activityEntries: buildActivityEntries(user),
  }
}
