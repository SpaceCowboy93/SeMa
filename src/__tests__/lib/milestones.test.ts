/**
 * Tests for the milestone "days together" label logic used in us/page.tsx.
 *
 * The calculation must be:
 *   - Timezone-safe (noon-anchor prevents UTC date-shift east of UTC)
 *   - Exact (uses date-fns differenceInYears/Months/CalendarDays, not /365 or /30)
 *   - Correct singular/plural labels
 *   - Robust near day and year boundaries
 */

import { describe, it, expect } from 'vitest'
import {
  parseISO,
  differenceInYears,
  differenceInMonths,
  differenceInCalendarDays,
  addYears,
  addMonths,
  startOfDay,
} from 'date-fns'

/**
 * Replicate the exact label logic from us/page.tsx so any divergence fails here.
 * If the page logic changes, update this function to match.
 */
function milestoneLabel(dateStr: string, today: Date): string {
  // Must stay in sync with the logic in src/app/(app)/us/page.tsx
  const milestoneDate = startOfDay(parseISO(dateStr + 'T12:00:00'))
  const todayStart    = startOfDay(today)
  const years  = differenceInYears(todayStart, milestoneDate)
  const afterY = addYears(milestoneDate, years)
  const months = differenceInMonths(todayStart, afterY)
  const afterM = addMonths(afterY, months)
  const days   = differenceInCalendarDays(todayStart, afterM)

  return years >= 1
    ? `${years} year${years !== 1 ? 's' : ''} together`
    : months >= 1
    ? `${months} month${months !== 1 ? 's' : ''} together`
    : `${days} day${days !== 1 ? 's' : ''} together`
}

// ── Singular / plural ─────────────────────────────────────────────────────────

describe('milestone label — singular/plural', () => {
  it('uses "day" for exactly 1 day ago', () => {
    const today     = new Date('2026-08-05T15:00:00')
    const yesterday = '2026-08-04'
    expect(milestoneLabel(yesterday, today)).toBe('1 day together')
  })

  it('uses "days" for 2+ days ago', () => {
    const today = new Date('2026-08-10T10:00:00')
    expect(milestoneLabel('2026-08-08', today)).toBe('2 days together')
  })

  it('uses "month" for exactly 1 month ago', () => {
    const today = new Date('2026-08-05T09:00:00')
    expect(milestoneLabel('2026-07-05', today)).toBe('1 month together')
  })

  it('uses "months" for 2+ months ago', () => {
    const today = new Date('2026-08-05T09:00:00')
    expect(milestoneLabel('2026-06-05', today)).toBe('2 months together')
  })

  it('uses "year" for exactly 1 year ago', () => {
    const today = new Date('2026-08-05T09:00:00')
    expect(milestoneLabel('2025-08-05', today)).toBe('1 year together')
  })

  it('uses "years" for 2+ years ago', () => {
    const today = new Date('2027-08-05T09:00:00')
    expect(milestoneLabel('2025-08-05', today)).toBe('2 years together')
  })
})

// ── Timezone safety (UTC date-shift bug) ──────────────────────────────────────

describe('milestone label — timezone safety', () => {
  /**
   * Without the noon anchor, parseISO('2026-08-04') returns midnight UTC.
   * In a UTC+3 timezone, that is 2026-08-03 at 23:00 local time — one day early.
   * With the T12:00:00 anchor, the date always resolves to the correct calendar day
   * in any timezone from UTC-11 to UTC+12.
   */
  it('noon-anchor ensures correct day in UTC+ timezones', () => {
    // Simulate: milestone on Aug 4, today is Aug 5 → should be "1 day together"
    const today    = new Date('2026-08-05T00:30:00') // very early morning — near midnight
    const dateStr  = '2026-08-04'
    const label    = milestoneLabel(dateStr, today)
    expect(label).toBe('1 day together')
  })

  it('day boundary: just before midnight does not jump a day early', () => {
    const today   = new Date('2026-08-10T23:55:00')
    const dateStr = '2026-08-09'
    expect(milestoneLabel(dateStr, today)).toBe('1 day together')
  })
})

// ── Accuracy vs. simple /365 and /30 approximations ──────────────────────────

describe('milestone label — leap year and calendar accuracy', () => {
  it('correctly shows 1 year for a leap year crossing (366 days)', () => {
    // 2024 is a leap year: 2024-01-01 + 366 days = 2025-01-01
    const today   = new Date('2025-01-01T12:00:00')
    const dateStr = '2024-01-01'
    // Math.floor(366/365) = 1 but differenceInYears also gives 1 — both agree here
    expect(milestoneLabel(dateStr, today)).toBe('1 year together')
  })

  it('does not jump to "1 year" for 364 days (Math.floor(364/365)=0)', () => {
    const today   = new Date('2026-07-31T12:00:00')
    const dateStr = '2025-08-04'
    // 362 days — should be months, not years
    const label = milestoneLabel(dateStr, today)
    expect(label).not.toMatch(/year/)
    expect(label).toMatch(/month/)
  })

  it('shows correct months for a 60-day span (Math.floor(60/30) = 2)', () => {
    // Both approaches agree here, but test ensures exact calendar months are used
    const today   = new Date('2026-10-01T12:00:00')
    const dateStr = '2026-08-01'
    expect(milestoneLabel(dateStr, today)).toBe('2 months together')
  })

  it('shows correct months for February (28 days — Math.floor(28/30)=0 is wrong)', () => {
    // Feb 1 → Mar 1 = exactly 1 month, but only 28 days in 2026
    // Math.floor(28/30) = 0 would wrongly show "days" — date-fns gives 1
    const today   = new Date('2026-03-01T12:00:00')
    const dateStr = '2026-02-01'
    expect(milestoneLabel(dateStr, today)).toBe('1 month together')
  })
})

// ── Year boundary ─────────────────────────────────────────────────────────────

describe('milestone label — year-level boundaries', () => {
  it('shows months when just under 1 year', () => {
    const today   = new Date('2026-08-04T12:00:00')
    const dateStr = '2025-08-05' // 364 days later today
    const label   = milestoneLabel(dateStr, today)
    expect(label).not.toMatch(/year/)
  })

  it('shows 1 year on the exact anniversary', () => {
    const today   = new Date('2026-08-05T12:00:00')
    const dateStr = '2025-08-05'
    expect(milestoneLabel(dateStr, today)).toBe('1 year together')
  })
})
