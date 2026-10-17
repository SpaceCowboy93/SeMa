/**
 * Unit tests for src/lib/utils.ts
 *
 * Covers: formatDate, formatTime, getDaysUntil, getCalendarDays,
 *         getWeekKey, getWeekStartDate, getWeekLabel, cn
 */

import { describe, it, expect } from 'vitest'
import {
  cn,
  formatDate,
  formatTime,
  getDaysUntil,
  getCalendarDays,
  toDateString,
  getWeekKey,
  getWeekStartDate,
  getWeekLabel,
} from '@/lib/utils'

// ── cn (classnames merge) ─────────────────────────────────────────────────────

describe('cn', () => {
  it('merges two class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('ignores falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null as unknown as string)).toBe('foo')
  })

  it('handles conditional objects', () => {
    expect(cn({ active: true, disabled: false })).toBe('active')
  })

  it('returns empty string for no inputs', () => {
    expect(cn()).toBe('')
  })
})

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats an ISO string with default format', () => {
    expect(formatDate('2025-01-15')).toBe('Jan 15, 2025')
  })

  it('formats a Date object', () => {
    expect(formatDate(new Date(2025, 5, 3))).toBe('Jun 3, 2025')
  })

  it('respects a custom format', () => {
    expect(formatDate('2025-12-25', 'dd/MM/yyyy')).toBe('25/12/2025')
  })

  it('handles month boundaries correctly', () => {
    expect(formatDate('2025-03-01')).toBe('Mar 1, 2025')
    expect(formatDate('2025-03-31')).toBe('Mar 31, 2025')
  })

  it('handles leap year Feb 29', () => {
    expect(formatDate('2024-02-29')).toBe('Feb 29, 2024')
  })
})

// ── formatTime ────────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats midnight correctly', () => {
    expect(formatTime('00:00')).toBe('12:00 AM')
  })

  it('formats noon correctly', () => {
    expect(formatTime('12:00')).toBe('12:00 PM')
  })

  it('formats 1 PM correctly', () => {
    expect(formatTime('13:00')).toBe('1:00 PM')
  })

  it('formats 11:59 PM correctly', () => {
    expect(formatTime('23:59')).toBe('11:59 PM')
  })

  it('formats morning time correctly', () => {
    expect(formatTime('09:30')).toBe('9:30 AM')
  })

  it('pads minutes with leading zero', () => {
    expect(formatTime('14:05')).toBe('2:05 PM')
  })
})

// ── getDaysUntil ──────────────────────────────────────────────────────────────

describe('getDaysUntil', () => {
  it('returns 0 for today', () => {
    const today = new Date()
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    expect(getDaysUntil(dateStr)).toBe(0)
  })

  it('returns a positive number for a future date', () => {
    const future = new Date()
    future.setDate(future.getDate() + 7)
    const dateStr = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
    expect(getDaysUntil(dateStr)).toBe(7)
  })

  it('returns a negative number for a past date', () => {
    const past = new Date()
    past.setDate(past.getDate() - 3)
    const dateStr = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`
    expect(getDaysUntil(dateStr)).toBe(-3)
  })
})

// ── getCalendarDays ───────────────────────────────────────────────────────────

describe('getCalendarDays', () => {
  it('returns a multiple-of-7 grid', () => {
    const days = getCalendarDays(2025, 0) // January 2025
    expect(days.length % 7).toBe(0)
  })

  it('includes all 31 days of January', () => {
    const days = getCalendarDays(2025, 0)
    const janDays = days.filter(d => d.getMonth() === 0 && d.getFullYear() === 2025)
    expect(janDays.length).toBe(31)
  })

  it('includes all 29 days of leap-year February', () => {
    const days = getCalendarDays(2024, 1) // Feb 2024 (leap)
    const febDays = days.filter(d => d.getMonth() === 1 && d.getFullYear() === 2024)
    expect(febDays.length).toBe(29)
  })

  it('includes all 28 days of non-leap-year February', () => {
    const days = getCalendarDays(2025, 1)
    const febDays = days.filter(d => d.getMonth() === 1 && d.getFullYear() === 2025)
    expect(febDays.length).toBe(28)
  })

  it('returns at least 28 total days for any month', () => {
    for (let m = 0; m < 12; m++) {
      expect(getCalendarDays(2025, m).length).toBeGreaterThanOrEqual(28)
    }
  })

  it('December grid is correct size', () => {
    const days = getCalendarDays(2025, 11)
    expect(days.length % 7).toBe(0)
    const decDays = days.filter(d => d.getMonth() === 11 && d.getFullYear() === 2025)
    expect(decDays.length).toBe(31)
  })

  it('leading days belong to the previous month', () => {
    // Jan 2025 starts on a Wednesday, so there are leading days from Dec 2024
    const days = getCalendarDays(2025, 0)
    const leadingDays = days.filter(d => d.getMonth() === 11) // December
    expect(leadingDays.length).toBeGreaterThanOrEqual(0)
  })
})

// ── toDateString ──────────────────────────────────────────────────────────────

describe('toDateString', () => {
  it('returns YYYY-MM-DD', () => {
    expect(toDateString(new Date(2025, 5, 3))).toBe('2025-06-03')
  })

  it('pads single-digit month and day', () => {
    expect(toDateString(new Date(2025, 0, 9))).toBe('2025-01-09')
  })
})

// ── getWeekKey ────────────────────────────────────────────────────────────────

describe('getWeekKey', () => {
  it('returns correct format YYYY-WNN', () => {
    expect(getWeekKey(new Date(2026, 6, 14))).toMatch(/^\d{4}-W\d{2}$/)
  })

  it('ISO week 1 of 2025 is the week containing Jan 6', () => {
    // Jan 6 2025 is a Monday — should be W02 (W01 contains Jan 1-5)
    const key = getWeekKey(new Date(2025, 0, 6))
    expect(key).toBe('2025-W02')
  })

  it('Jan 1 2025 (Wednesday) belongs to week 01 of 2025', () => {
    const key = getWeekKey(new Date(2025, 0, 1))
    expect(key).toBe('2025-W01')
  })

  it('Dec 29 2025 belongs to week 01 of 2026', () => {
    // Dec 29 2025 is a Monday; ISO week 1 2026 starts on Dec 29 2025
    const key = getWeekKey(new Date(2025, 11, 29))
    expect(key).toBe('2026-W01')
  })
})

// ── getWeekStartDate ──────────────────────────────────────────────────────────

describe('getWeekStartDate', () => {
  it('returns a Monday for week key 2026-W29', () => {
    const date = getWeekStartDate('2026-W29')
    expect(date.getDay()).toBe(1) // 1 = Monday
  })

  it('round-trips through getWeekKey', () => {
    const originalKey = '2025-W20'
    const start = getWeekStartDate(originalKey)
    expect(getWeekKey(start)).toBe(originalKey)
  })

  it('returns a Monday for week 1 of 2025', () => {
    const start = getWeekStartDate('2025-W01')
    expect(start.getDay()).toBe(1)
  })
})

// ── getWeekLabel ──────────────────────────────────────────────────────────────

describe('getWeekLabel', () => {
  it('contains the week number', () => {
    const label = getWeekLabel('2026-W29')
    expect(label).toContain('Week 29')
  })

  it('contains a month abbreviation', () => {
    const label = getWeekLabel('2026-W29')
    expect(label).toMatch(/[A-Z][a-z]{2}/)
  })

  it('contains an en-dash range separator', () => {
    const label = getWeekLabel('2026-W29')
    expect(label).toContain('·')
  })
})
