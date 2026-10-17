export type UserName = 'seval' | 'mateo'

export interface UserConfig {
  name: UserName
  displayName: string
  emoji: string
  theme: 'seval' | 'mateo'
}

export const USERS: Record<UserName, UserConfig> = {
  seval: { name: 'seval', displayName: 'Seval', emoji: '🌸', theme: 'seval' },
  mateo: { name: 'mateo', displayName: 'Mateo', emoji: '🌊', theme: 'mateo' },
}

export const OTHER_USER: Record<UserName, UserName> = {
  seval: 'mateo',
  mateo: 'seval',
}

export type EventColor = 'seval' | 'blue' | 'yellow' | 'green'

export interface CalendarEvent {
  id: string
  title: string
  date: string // YYYY-MM-DD
  startTime?: string // HH:MM
  endTime?: string // HH:MM
  notes?: string
  emoji?: string
  color: EventColor
  todos?: EventTodo[]
  photos?: string[] // Supabase Storage public URLs
  backgroundPhoto?: string // URL of the photo used as card background
  createdBy: UserName
  createdAt: string
  updatedAt: string
  linkedTodoId?: string
  linkedGoalId?: string
}

export interface EventTodo {
  id: string
  title: string
  isCompleted: boolean
}

export interface SharedTodo {
  id: string
  title: string
  items?: string[]       // sub-items / checklist entries
  notes?: string         // free-form notes (not synced to calendar)
  isCompleted: boolean
  completedBy?: UserName
  createdBy: UserName
  createdAt: string
  date?: string          // YYYY-MM-DD (optional, syncs to calendar)
  startTime?: string     // HH:MM (optional)
  color?: EventColor
  linkedEventId?: string // ID of the linked CalendarEvent (if any)
  photos?: string[]
  backgroundPhoto?: string
}

export type MoodType = 'happy' | 'relaxed' | 'tired' | 'sad' | 'stressed'

export interface MoodEntry {
  userId: UserName
  date: string // YYYY-MM-DD
  mood: MoodType
  note?: string
}

export interface LoveNote {
  id: string
  from: UserName
  content: string
  createdAt: string
  isPinned: boolean
}

export type WishlistCategory = 'date' | 'restaurant' | 'movie' | 'travel' | 'plan'

export interface WishlistItem {
  id: string
  title: string
  category: WishlistCategory
  notes?: string
  date?: string          // YYYY-MM-DD (optional target/desired date)
  startTime?: string     // HH:MM (optional)
  isCompleted: boolean
  createdBy: UserName
  createdAt: string
  photos?: string[]      // Supabase Storage public URLs
  backgroundPhoto?: string
  checklist?: string[]
}

export interface ChecklistEntry {
  text: string
  isCompleted: boolean
}

export type FocusReminder = 'none' | 'at_time' | '5min' | '10min' | '30min' | '1h'
export type FocusPriority = 'low' | 'medium' | 'high'

export interface Countdown {
  id: string
  title: string
  date: string // YYYY-MM-DD
  emoji: string
  createdBy: UserName
  time?: string            // HH:MM
  notes?: string
  checklist?: string[]           // legacy — kept for backward compat
  checklistEntries?: ChecklistEntry[] // replaces checklist
  photos?: string[]
  romanticMessage?: string
}

export type GoalCategory =
  | 'travel'
  | 'money'
  | 'fitness'
  | 'life'
  | 'learning'
  | 'hobbies'
  | 'challenges'

export interface Goal {
  id: string
  categoryId: GoalCategory
  title: string
  notes?: string
  targetDate?: string        // YYYY-MM-DD
  startTime?: string         // HH:MM (optional, for day-of reminder)
  progressCurrent: number    // how many steps done
  progressTarget: number     // 0 = simple done/not-done; >0 = counter goal
  isCompleted: boolean
  createdBy: UserName
  createdAt: string
  linkedEventId?: string     // ID of the linked CalendarEvent (if targetDate is set)
  photos?: string[]          // Supabase Storage public URLs
  backgroundPhoto?: string
  checklist?: string[]
  checklistItems?: EventTodo[]   // stable IDs/completion; checklist remains a legacy text projection
}

export interface PartnerNote {
  id: string
  from: UserName
  to: UserName
  content: string
  createdAt: string
  isRead: boolean
}

export interface ShoppingItem {
  id: string
  name: string
  quantity: number
  isChecked: boolean
  checkedBy?: UserName
  createdAt: string
  notes?: string
  price?: number
  link?: string
  photo?: string  // base64 data URL
}

export interface FinanceCategoryItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  note?: string
  isPaid?: boolean
  createdAt: string
  updatedAt: string
}

export interface BudgetItem {
  id: string
  category: string
  emoji: string
  planned: number
  actual: number
  note?: string
  // Extended (all optional — backward-compat)
  photos?: string[]
  items?: FinanceCategoryItem[]
  actualSpendingMode?: 'items' | 'manual'
  manualActualSpending?: number
}

export interface SavingsGoal {
  id: string
  title: string
  emoji: string
  targetAmount: number
  savedAmount: number
  deadline?: string   // YYYY-MM-DD
  notes?: string
  createdBy: UserName
  createdAt: string
}

export interface ShoppingListReceipt {
  store: string
  date: string          // YYYY-MM-DD
  currency: string      // e.g. 'EUR'
  items: ReceiptItem[]
  subtotal: number
  tax: number
  grandTotal: number
  photos?: string[]     // receipt photo(s)
}

export interface ShoppingList {
  id: string
  name: string
  items: ShoppingItem[]
  createdBy: UserName
  createdAt: string
  updatedAt: string
  // Enhanced fields
  storeName?: string
  date?: string        // YYYY-MM-DD
  time?: string        // HH:MM
  notes?: string
  coverPhoto?: string  // base64 data URL (legacy single photo — kept for compat)
  photos?: string[]    // multiple base64 data URLs; photos[0] is the cover
  isCompleted?: boolean
  completedAt?: string
  completedBy?: UserName
  completionNote?: string
  receipt?: ShoppingListReceipt  // populated after scanning a receipt
  // Finance linkage — stable link to the FinanceCategoryItem created on completion
  financeItemId?: string     // ID of the FinanceCategoryItem in the linked Finance month
  financeMonthKey?: string   // Finance month key ('YYYY-MM') where the link lives
}

export type ShoppingListInput = {
  name: string
  storeName?: string
  date?: string
  time?: string
  notes?: string
  coverPhoto?: string  // kept for compat
  photos?: string[]    // preferred for new lists
}

export interface Memory {
  id: string
  date: string // YYYY-MM-DD
  title: string
  notes?: string
  photos?: string[] // base64 data URLs
  createdBy: UserName
  createdAt: string
  category?: string
  checklist?: string[]
}

export interface FinanceMonth {
  key: string              // 'YYYY-MM'
  income: number
  budgetItems: BudgetItem[]
  isFinalized: boolean
  report?: FinanceMonthReport
  createdAt: string
  updatedAt: string
}

export interface FinanceMonthReport {
  generatedAt: string
  totalIncome: number
  totalExpenses: number
  totalSaved: number
  remaining: number
  savingsRate: number      // percentage
  topCategory?: string
  overBudgetCategories: string[]
}

export interface SavingsTransaction {
  id: string
  monthKey: string         // 'YYYY-MM'
  amount: number           // positive = contribution, negative = withdrawal
  note?: string
  createdAt: string
  createdBy: UserName
}

// ── Weekly Focus ──────────────────────────────────────────────────────────────

export interface FocusChecklistItem {
  id: string
  text: string
  done: boolean
}

/** A single planned activity within a Weekly Focus day. */
export interface FocusActivity {
  id: string
  weekKey: string             // 'YYYY-WNN' e.g. '2026-W29'
  dayIndex: number            // 0 = Monday … 6 = Sunday
  title: string
  time?: string               // HH:MM optional
  notes?: string
  checklist?: FocusChecklistItem[]
  photos?: string[]           // Supabase Storage public URLs
  isCompleted: boolean
  createdBy: UserName | 'both'
  createdAt: string
  updatedAt: string
  /** @deprecated Use `reminders` array instead */
  reminder?: FocusReminder
  /** Multi-select reminders (replaces single `reminder`). Empty array = no reminders. */
  reminders?: FocusReminder[]
  priority?: FocusPriority
}

// ── Receipt scanner ───────────────────────────────────────────────────────────
export interface ReceiptItem {
  id: string
  name: string
  quantity: number
  unitPrice: number
  lineTotal: number
  confidence?: number      // 0–1, from OCR; undefined = manually entered
}

export interface ReceiptResult {
  store: string
  date: string             // YYYY-MM-DD
  currency: string         // e.g. 'EUR'
  items: ReceiptItem[]
  subtotal: number
  tax: number
  grandTotal: number
}
