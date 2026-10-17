import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import {
  format, differenceInDays, parseISO,
  getISOWeek, getISOWeekYear, startOfISOWeek, addWeeks,
} from 'date-fns'
import type { UserName, MoodType, WishlistCategory } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, fmt = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt)
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayH = h % 12 || 12
  return `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`
}

export function getTodayString(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getDaysUntil(dateStr: string): number {
  const target = parseISO(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return differenceInDays(target, today)
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const MOOD_CONFIG: Record<MoodType, { emoji: string; label: string }> = {
  happy:   { emoji: '😊', label: 'Happy' },
  relaxed: { emoji: '😌', label: 'Relaxed' },
  tired:   { emoji: '😴', label: 'Tired' },
  sad:     { emoji: '😔', label: 'Sad' },
  stressed:{ emoji: '😤', label: 'Stressed' },
}

export const WISHLIST_CATEGORY_CONFIG: Record<WishlistCategory, { emoji: string; label: string }> = {
  date:       { emoji: '💕', label: 'Date Ideas' },
  restaurant: { emoji: '🍽️', label: 'Restaurants' },
  movie:      { emoji: '🎬', label: 'Movies' },
  travel:     { emoji: '✈️', label: 'Travel' },
  plan:       { emoji: '🌟', label: 'Future Plans' },
}

// Tailwind class maps per user theme
export const THEME = {
  seval: {
    bg:        'bg-seval-500',
    bgLight:   'bg-seval-100',
    bgLighter: 'bg-seval-50',
    text:      'text-seval-600',
    textLight: 'text-seval-500',
    border:    'border-seval-200',
    ring:      'ring-seval-400',
    gradient:  'from-seval-400 to-seval-500',
  },
  mateo: {
    bg:        'bg-mateo-500',
    bgLight:   'bg-mateo-100',
    bgLighter: 'bg-mateo-50',
    text:      'text-mateo-600',
    textLight: 'text-mateo-500',
    border:    'border-mateo-200',
    ring:      'ring-mateo-400',
    gradient:  'from-mateo-400 to-mateo-500',
  },
}

export function getTheme(user: UserName) {
  return THEME[user]
}

// Event color hex values (for inline styles)
export const COLOR_HEX: Record<string, string> = {
  seval:  '#a78bfa', // Purple
  blue:   '#60a5fa', // Blue
  yellow: '#fbbf24', // Yellow
  green:  '#34d399', // Green
  // Legacy
  mateo:  '#60a5fa',
  pink:   '#a78bfa',
}

// Event color to tailwind bg class
export const EVENT_COLOR_CLASS: Record<string, string> = {
  seval:  'bg-seval-400',   // Purple
  blue:   'bg-blue-400',    // Blue
  yellow: 'bg-yellow-400',  // Yellow
  green:  'bg-emerald-400', // Green
  // Legacy keys — old saved data maps to nearest new color
  mateo:  'bg-blue-400',    // was Teal → Blue
  pink:   'bg-seval-400',   // was Pink → Purple
}

// Calendar grid helper
export function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0=Sun

  const days: Date[] = []

  // Leading days from prev month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, 0)
    d.setDate(d.getDate() - i)
    days.push(new Date(d))
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d))
  }

  // Trailing days to complete grid
  const trailing = 7 - (days.length % 7)
  if (trailing < 7) {
    for (let d = 1; d <= trailing; d++) {
      days.push(new Date(year, month + 1, d))
    }
  }

  return days
}

export function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

// ── Weekly Focus week utilities ────────────────────────────────────────────────

/** Returns the ISO week key for a given date, e.g. '2026-W29'. */
export function getWeekKey(date: Date = new Date()): string {
  const week = getISOWeek(date)
  const year = getISOWeekYear(date)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** Returns the Monday Date of the given week key. */
export function getWeekStartDate(weekKey: string): Date {
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = parseInt(yearStr, 10)
  const week = parseInt(weekStr, 10)
  // Jan 4 is always in ISO week 1 of its year
  const jan4 = new Date(year, 0, 4)
  const weekOneMonday = startOfISOWeek(jan4)
  return addWeeks(weekOneMonday, week - 1)
}

/** Returns a human-readable label, e.g. 'Week 29 · Jul 14–20'. */
export function getWeekLabel(weekKey: string): string {
  const monday = getWeekStartDate(weekKey)
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  const weekNum = parseInt(weekKey.split('-W')[1], 10)
  return `Week ${weekNum} · ${format(monday, 'MMM d')}–${format(sunday, 'd')}`
}
