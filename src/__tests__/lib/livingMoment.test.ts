/**
 * Unit tests for src/lib/livingMoment.ts
 *
 * Covers priority logic, keyword detection, shopping subtitle, defaults.
 */

import { describe, it, expect } from 'vitest'
import { getLivingMoment, type LivingMomentInput } from '@/lib/livingMoment'
import type { CalendarEvent, ShoppingList, UserName } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<LivingMomentInput> = {}): LivingMomentInput {
  return {
    events:         [],
    countdowns:     [],
    shoppingLists:  [],
    todos:          [],
    partnerNotes:   [],
    currentUser:    'mateo' as UserName,
    today:          '2025-06-15',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id:        'ev-1',
    title:     'Test Event',
    date:      '2025-06-15',
    color:     'blue',
    createdBy: 'mateo',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    ...overrides,
  }
}

function makeShoppingList(pendingItems: number, completed = false): ShoppingList {
  return {
    id:        'sl-1',
    name:      'Weekly shop',
    items:     Array.from({ length: pendingItems }, (_, i) => ({
      id:        `item-${i}`,
      name:      `Item ${i}`,
      quantity:  1,
      isChecked: false,
      createdAt: '2025-06-01T00:00:00Z',
    })),
    createdBy: 'mateo',
    createdAt: '2025-06-01T00:00:00Z',
    updatedAt: '2025-06-01T00:00:00Z',
    isCompleted: completed,
  }
}

// ── Default / quiet day ───────────────────────────────────────────────────────

describe('getLivingMoment — quiet day', () => {
  it('returns calm subtitles when there are no events or todos', () => {
    const result = getLivingMoment(makeInput())
    expect(result.homeSubtitle).toContain('calm')
  })

  it('default shopping title is "Shopping together"', () => {
    const result = getLivingMoment(makeInput())
    expect(result.shoppingTitle).toBe('Shopping together')
  })

  it('default shopping subtitle says "Everything is home." when no pending items', () => {
    const result = getLivingMoment(makeInput())
    expect(result.shoppingSubtitle).toBe('Everything is home.')
  })
})

// ── Birthday today ────────────────────────────────────────────────────────────

describe('getLivingMoment — birthday today', () => {
  it('detects "birthday" keyword in event title', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: "Seval's birthday party", date: '2025-06-15' })],
    }))
    expect(result.homeSubtitle).toContain('special day')
  })

  it('detects "bday" shorthand', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Seval bday', date: '2025-06-15' })],
    }))
    expect(result.homeSubtitle).toContain('special day')
  })

  it('shows birthday shopping title', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Birthday celebration', date: '2025-06-15' })],
    }))
    expect(result.shoppingTitle).toContain('celebration')
  })
})

// ── Anniversary ───────────────────────────────────────────────────────────────

describe('getLivingMoment — anniversary today', () => {
  it('returns anniversary subtitle', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Our anniversary dinner', date: '2025-06-15' })],
    }))
    expect(result.homeSubtitle).toContain('anniversary')
  })
})

// ── Travel ────────────────────────────────────────────────────────────────────

describe('getLivingMoment — travel', () => {
  it('detects trip starting today', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Flight to Paris', date: '2025-06-15' })],
    }))
    expect(result.homeSubtitle).toContain('memories')
  })

  it('detects trip tomorrow', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Vacation starts', date: '2025-06-16' })],
    }))
    expect(result.homeSubtitle).toContain('tomorrow')
  })

  it('shows "Getting ready to go" shopping title for travel', () => {
    const result = getLivingMoment(makeInput({
      events: [makeEvent({ title: 'Holiday trip', date: '2025-06-15' })],
    }))
    expect(result.shoppingTitle).toContain('ready')
  })
})

// ── Christmas week ─────────────────────────────────────────────────────────────

describe('getLivingMoment — seasonal moments', () => {
  it('returns Christmas week subtitle on Dec 24', () => {
    const result = getLivingMoment(makeInput({ today: '2025-12-24' }))
    expect(result.homeSubtitle).toContain('Christmas')
  })

  it('returns New Year Eve subtitle on Dec 31', () => {
    const result = getLivingMoment(makeInput({ today: '2025-12-31' }))
    expect(result.homeSubtitle).toContain('celebrate')
  })

  it('returns New Year subtitle on Jan 1', () => {
    const result = getLivingMoment(makeInput({ today: '2026-01-01' }))
    expect(result.homeSubtitle).toContain('New Year')
  })

  it('does not trigger Christmas outside Dec 22-26', () => {
    const result = getLivingMoment(makeInput({ today: '2025-12-21' }))
    expect(result.homeSubtitle).not.toContain('Christmas')
  })
})

// ── Shopping pending ──────────────────────────────────────────────────────────

describe('getLivingMoment — shopping lists', () => {
  it('counts pending items across all incomplete lists', () => {
    const result = getLivingMoment(makeInput({
      shoppingLists: [makeShoppingList(3)],
    }))
    expect(result.shoppingSubtitle).toContain('3')
  })

  it('shows "things" plural for multiple items', () => {
    const result = getLivingMoment(makeInput({
      shoppingLists: [makeShoppingList(2)],
    }))
    expect(result.shoppingSubtitle).toContain('things')
  })

  it('shows "thing" singular for 1 item', () => {
    const result = getLivingMoment(makeInput({
      shoppingLists: [makeShoppingList(1)],
    }))
    expect(result.shoppingSubtitle).toContain('thing')
    expect(result.shoppingSubtitle).not.toContain('things')
  })

  it('ignores completed lists in pending count', () => {
    const result = getLivingMoment(makeInput({
      shoppingLists: [makeShoppingList(5, true)], // completed
    }))
    expect(result.shoppingSubtitle).toBe('Everything is home.')
  })

  it('returns shopping-restock subtitle when lists are pending', () => {
    const result = getLivingMoment(makeInput({
      shoppingLists: [makeShoppingList(2)],
    }))
    expect(result.homeSubtitle).toContain('restock')
  })
})

// ── Unread partner note ────────────────────────────────────────────────────────

describe('getLivingMoment — partner note', () => {
  it('detects an unread note addressed to current user', () => {
    const result = getLivingMoment(makeInput({
      partnerNotes: [{
        id:        'note-1',
        from:      'seval',
        to:        'mateo',
        content:   'I love you',
        createdAt: '2025-06-15T10:00:00Z',
        isRead:    false,
      }],
    }))
    expect(result.homeSubtitle).toContain('surprise')
  })

  it('ignores a read note', () => {
    const result = getLivingMoment(makeInput({
      partnerNotes: [{
        id:        'note-1',
        from:      'seval',
        to:        'mateo',
        content:   'I love you',
        createdAt: '2025-06-15T10:00:00Z',
        isRead:    true,
      }],
    }))
    expect(result.homeSubtitle).not.toContain('surprise')
  })
})

// ── Busy day ──────────────────────────────────────────────────────────────────

describe('getLivingMoment — busy day', () => {
  it('triggers when 3+ events and todos today', () => {
    const result = getLivingMoment(makeInput({
      events: [
        makeEvent({ title: 'Dentist', date: '2025-06-15' }),
        makeEvent({ title: 'Lunch', date: '2025-06-15' }),
      ],
      todos: [{
        id: 't1', title: 'Groceries', isCompleted: false, createdBy: 'mateo',
        createdAt: '2025-06-15T00:00:00Z', date: '2025-06-15',
      }],
    }))
    expect(result.homeSubtitle).toContain('Busy')
  })
})

// ── Priority ordering ─────────────────────────────────────────────────────────

describe('getLivingMoment — priority ordering', () => {
  it('birthday takes priority over dinner event', () => {
    const result = getLivingMoment(makeInput({
      events: [
        makeEvent({ title: 'Birthday dinner', date: '2025-06-15' }),
        makeEvent({ title: 'Restaurant reservation', date: '2025-06-15' }),
      ],
    }))
    // Birthday wins, should mention special day not dinner
    expect(result.homeSubtitle).toContain('special day')
  })
})

// ── dayAfter / tomorrow detection ─────────────────────────────────────────────

describe('getLivingMoment — tomorrow detection', () => {
  it('handles month boundary when calculating tomorrow', () => {
    // today = last day of January, tomorrow = Feb 1
    const result = getLivingMoment(makeInput({
      today:  '2025-01-31',
      events: [makeEvent({ title: 'Vacation trip', date: '2025-02-01' })],
    }))
    expect(result.homeSubtitle).toContain('tomorrow')
  })

  it('handles year boundary when calculating tomorrow', () => {
    const result = getLivingMoment(makeInput({
      today:  '2025-12-31',
      events: [makeEvent({ title: 'Flight to NYC', date: '2026-01-01' })],
    }))
    // Dec 31 triggers New Year Eve first
    expect(result.homeSubtitle).not.toBe('')
  })
})
