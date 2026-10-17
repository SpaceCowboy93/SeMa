/**
 * Unit tests for src/lib/briefing.ts
 *
 * Covers: briefingStorageKey, generateBriefingItems
 */

import { describe, it, expect } from 'vitest'
import { briefingStorageKey, generateBriefingItems, type BriefingState } from '@/lib/briefing'
import type { UserName } from '@/types'

// ── briefingStorageKey ────────────────────────────────────────────────────────

describe('briefingStorageKey', () => {
  it('includes the user name', () => {
    expect(briefingStorageKey('mateo', '2025-06-15')).toContain('mateo')
  })

  it('includes the date', () => {
    expect(briefingStorageKey('seval', '2025-06-15')).toContain('2025-06-15')
  })

  it('differs between users', () => {
    const k1 = briefingStorageKey('mateo', '2025-06-15')
    const k2 = briefingStorageKey('seval', '2025-06-15')
    expect(k1).not.toBe(k2)
  })

  it('differs between dates', () => {
    const k1 = briefingStorageKey('mateo', '2025-06-15')
    const k2 = briefingStorageKey('mateo', '2025-06-16')
    expect(k1).not.toBe(k2)
  })
})

// ── generateBriefingItems — empty state ───────────────────────────────────────

function emptyState(): BriefingState {
  return {
    events:          [],
    todos:           [],
    focusActivities: [],
    partnerNotes:    [],
    moods:           [],
    countdowns:      [],
    savingsGoals:    [],
    shoppingLists:   [],
  }
}

describe('generateBriefingItems — empty state', () => {
  it('returns an empty array when there is nothing to show', () => {
    const items = generateBriefingItems('mateo', emptyState(), '2025-06-15')
    expect(items).toHaveLength(0)
  })
})

// ── generateBriefingItems — today events ──────────────────────────────────────

describe('generateBriefingItems — events', () => {
  it('includes events scheduled for today', () => {
    const state = {
      ...emptyState(),
      events: [{
        id: 'ev1', title: 'Dentist appointment', date: '2025-06-15',
        color: 'blue' as const, createdBy: 'mateo' as UserName,
        createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'event')).toBe(true)
  })

  it('does not include events from other dates', () => {
    const state = {
      ...emptyState(),
      events: [{
        id: 'ev1', title: 'Future event', date: '2025-07-01',
        color: 'blue' as const, createdBy: 'mateo' as UserName,
        createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.filter(i => i.kind === 'event')).toHaveLength(0)
  })

  it('includes at most 2 events', () => {
    const state = {
      ...emptyState(),
      events: Array.from({ length: 5 }, (_, i) => ({
        id: `ev${i}`, title: `Event ${i}`, date: '2025-06-15',
        color: 'blue' as const, createdBy: 'mateo' as UserName,
        createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      })),
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.filter(i => i.kind === 'event').length).toBeLessThanOrEqual(2)
  })

  it('sorts timed events before untimed events', () => {
    const state = {
      ...emptyState(),
      events: [
        {
          id: 'ev1', title: 'No time', date: '2025-06-15',
          color: 'blue' as const, createdBy: 'mateo' as UserName,
          createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
        },
        {
          id: 'ev2', title: 'Morning meeting', date: '2025-06-15', startTime: '09:00',
          color: 'blue' as const, createdBy: 'mateo' as UserName,
          createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
        },
      ],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const eventItems = items.filter(i => i.kind === 'event')
    expect(eventItems[0]?.label).toBe('Morning meeting')
  })
})

// ── generateBriefingItems — overdue todos ─────────────────────────────────────

describe('generateBriefingItems — overdue todos', () => {
  it('includes an overdue todo', () => {
    const state = {
      ...emptyState(),
      todos: [{
        id: 'todo1', title: 'Call doctor', isCompleted: false,
        date: '2025-06-10', // before today
        createdBy: 'mateo' as UserName, createdAt: '2025-06-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'todo_urgent')).toBe(true)
  })

  it('does not include completed overdue todos', () => {
    const state = {
      ...emptyState(),
      todos: [{
        id: 'todo1', title: 'Done task', isCompleted: true,
        date: '2025-06-10',
        createdBy: 'mateo' as UserName, createdAt: '2025-06-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'todo_urgent')).toBe(false)
  })

  it('includes at most 1 overdue todo', () => {
    const state = {
      ...emptyState(),
      todos: Array.from({ length: 3 }, (_, i) => ({
        id: `todo${i}`, title: `Overdue ${i}`, isCompleted: false,
        date: `2025-06-0${i + 1}`,
        createdBy: 'mateo' as UserName, createdAt: '2025-06-01T00:00:00Z',
      })),
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.filter(i => i.kind === 'todo_urgent').length).toBeLessThanOrEqual(1)
  })
})

// ── generateBriefingItems — partner note ──────────────────────────────────────

describe('generateBriefingItems — partner note', () => {
  it('includes an unread note for the current user', () => {
    const state = {
      ...emptyState(),
      partnerNotes: [{
        id: 'note1', from: 'seval' as UserName, to: 'mateo' as UserName,
        content: 'Hello my love!', createdAt: '2025-06-15T10:00:00Z', isRead: false,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'partner_note')).toBe(true)
  })

  it('truncates long note content to 50 chars + ellipsis', () => {
    const longContent = 'A'.repeat(80)
    const state = {
      ...emptyState(),
      partnerNotes: [{
        id: 'note1', from: 'seval' as UserName, to: 'mateo' as UserName,
        content: longContent, createdAt: '2025-06-15T10:00:00Z', isRead: false,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const note = items.find(i => i.kind === 'partner_note')
    expect(note?.sub?.endsWith('…')).toBe(true)
    expect(note?.sub?.length).toBeLessThanOrEqual(53) // 50 + "…"
  })

  it('does not include a read note', () => {
    const state = {
      ...emptyState(),
      partnerNotes: [{
        id: 'note1', from: 'seval' as UserName, to: 'mateo' as UserName,
        content: 'Hello!', createdAt: '2025-06-15T10:00:00Z', isRead: true,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'partner_note')).toBe(false)
  })
})

// ── generateBriefingItems — savings goal ─────────────────────────────────────

describe('generateBriefingItems — savings goal', () => {
  it('includes an active savings goal', () => {
    const state = {
      ...emptyState(),
      savingsGoals: [{
        id: 'goal1', title: 'Tokyo trip', emoji: '✈️',
        targetAmount: 2000, savedAmount: 1000,
        createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'savings_goal')).toBe(true)
  })

  it('shows correct percentage in subtitle', () => {
    const state = {
      ...emptyState(),
      savingsGoals: [{
        id: 'goal1', title: 'Tokyo trip', emoji: '✈️',
        targetAmount: 1000, savedAmount: 750,
        createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const goal = items.find(i => i.kind === 'savings_goal')
    expect(goal?.sub).toContain('75%')
  })

  it('does not include a completed goal (savedAmount >= targetAmount)', () => {
    const state = {
      ...emptyState(),
      savingsGoals: [{
        id: 'goal1', title: 'Done goal', emoji: '✅',
        targetAmount: 500, savedAmount: 500,
        createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'savings_goal')).toBe(false)
  })

  it('does not include goal with targetAmount = 0', () => {
    const state = {
      ...emptyState(),
      savingsGoals: [{
        id: 'goal1', title: 'Zero goal', emoji: '0',
        targetAmount: 0, savedAmount: 0,
        createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'savings_goal')).toBe(false)
  })

  it('picks the goal with highest percentage', () => {
    const state = {
      ...emptyState(),
      savingsGoals: [
        {
          id: 'g1', title: '25% goal', emoji: 'A',
          targetAmount: 1000, savedAmount: 250,
          createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'g2', title: '80% goal', emoji: 'B',
          targetAmount: 1000, savedAmount: 800,
          createdBy: 'mateo' as UserName, createdAt: '2025-01-01T00:00:00Z',
        },
      ],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const goal = items.find(i => i.kind === 'savings_goal')
    expect(goal?.label).toBe('80% goal')
  })
})

// ── generateBriefingItems — countdown ─────────────────────────────────────────

describe('generateBriefingItems — countdown', () => {
  it('includes an upcoming countdown', () => {
    const state = {
      ...emptyState(),
      countdowns: [{
        id: 'cd1', title: 'Holiday', date: '2025-07-01', emoji: '🌴',
        createdBy: 'mateo' as UserName,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'countdown')).toBe(true)
  })

  it('shows "Today!" for a countdown happening today', () => {
    const state = {
      ...emptyState(),
      countdowns: [{
        id: 'cd1', title: 'Today event', date: '2025-06-15', emoji: '🎉',
        createdBy: 'mateo' as UserName,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const countdown = items.find(i => i.kind === 'countdown')
    expect(countdown?.sub).toBe('Today!')
  })

  it('does not include past countdowns', () => {
    const state = {
      ...emptyState(),
      countdowns: [{
        id: 'cd1', title: 'Past event', date: '2025-06-01', emoji: '📅',
        createdBy: 'mateo' as UserName,
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'countdown')).toBe(false)
  })
})

// ── generateBriefingItems — shopping list ─────────────────────────────────────

describe('generateBriefingItems — shopping list', () => {
  it('includes a shopping list due today', () => {
    const state = {
      ...emptyState(),
      shoppingLists: [{
        id: 'sl1', name: 'Weekly shop', date: '2025-06-15', isCompleted: false,
        items: [{ id: 'i1', name: 'Milk', quantity: 1, isChecked: false, createdAt: '' }],
        createdBy: 'mateo' as UserName, createdAt: '', updatedAt: '',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.some(i => i.kind === 'shopping_list')).toBe(true)
  })

  it('shows correct remaining item count', () => {
    const state = {
      ...emptyState(),
      shoppingLists: [{
        id: 'sl1', name: 'Shop', date: '2025-06-15', isCompleted: false,
        items: [
          { id: 'i1', name: 'Milk',  quantity: 1, isChecked: false, createdAt: '' },
          { id: 'i2', name: 'Bread', quantity: 1, isChecked: true,  createdAt: '' },
          { id: 'i3', name: 'Eggs',  quantity: 1, isChecked: false, createdAt: '' },
        ],
        createdBy: 'mateo' as UserName, createdAt: '', updatedAt: '',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    const shopItem = items.find(i => i.kind === 'shopping_list')
    expect(shopItem?.sub).toContain('2')
  })
})

// ── generateBriefingItems — MAX_ROWS cap ──────────────────────────────────────

describe('generateBriefingItems — row cap', () => {
  it('returns at most 6 items regardless of data size', () => {
    const state: BriefingState = {
      events: Array.from({ length: 5 }, (_, i) => ({
        id: `ev${i}`, title: `Event ${i}`, date: '2025-06-15',
        color: 'blue' as const, createdBy: 'mateo' as UserName,
        createdAt: '2025-06-01T00:00:00Z', updatedAt: '2025-06-01T00:00:00Z',
      })),
      todos: Array.from({ length: 3 }, (_, i) => ({
        id: `todo${i}`, title: `Overdue ${i}`, isCompleted: false,
        date: '2025-06-01', createdBy: 'mateo' as UserName, createdAt: '',
      })),
      focusActivities: [],
      partnerNotes: [{
        id: 'n1', from: 'seval' as UserName, to: 'mateo' as UserName,
        content: 'Hey', createdAt: '', isRead: false,
      }],
      moods: [{ userId: 'seval' as UserName, date: '2025-06-15', mood: 'happy' }],
      countdowns: [{
        id: 'cd1', title: 'Holiday', date: '2025-07-01', emoji: '🌴',
        createdBy: 'mateo' as UserName,
      }],
      savingsGoals: [{
        id: 'g1', title: 'Goal', emoji: '💰',
        targetAmount: 1000, savedAmount: 500,
        createdBy: 'mateo' as UserName, createdAt: '',
      }],
      shoppingLists: [{
        id: 'sl1', name: 'Shop', date: '2025-06-15', isCompleted: false,
        items: [{ id: 'i1', name: 'Milk', quantity: 1, isChecked: false, createdAt: '' }],
        createdBy: 'mateo' as UserName, createdAt: '', updatedAt: '',
      }],
    }
    const items = generateBriefingItems('mateo', state, '2025-06-15')
    expect(items.length).toBeLessThanOrEqual(6)
  })
})
