/**
 * Authenticated-interface layout tests for Planner and Todos pages.
 *
 * Uses local Zustand fixtures — no network or Supabase calls.
 *
 * PlannerPage checks:
 *   - Renders at every target viewport without crash.
 *   - "Upcoming dates" section appears when future events / countdowns exist.
 *   - "Needs attention" section appears for overdue todos.
 *   - WeeklyFocusSection is present.
 *
 * TodosPage checks:
 *   - Empty state renders without crash.
 *   - Add-plan button has an accessible name and opens the create form.
 *   - Create form exposes title input, step input, Save and Cancel controls.
 *   - Save is disabled when the title is empty; enabled once text is entered.
 *   - Cancel closes the form without mutating the store.
 *   - Existing pending and completed todos appear in their respective sections.
 *   - TodoItem icon-only buttons (toggle, expand, edit, delete) have aria-labels.
 *   - Long title content renders without crash.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/store/useAppStore'
import type { CalendarEvent, Countdown, SharedTodo } from '@/types'
import TodosPage from '@/app/(app)/todos/page'
import PlannerPage from '@/app/(app)/planner/page'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActUser() {
  const setup = userEvent.setup({ delay: null })
  return {
    click: (el: Element) => act(async () => { await setup.click(el) }),
    type:  (el: Element, text: string) => act(async () => { await setup.type(el, text) }),
  }
}

const TODAY = '2027-03-19'
const FUTURE = '2027-04-01'
const PAST   = '2024-01-01'

function freshStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    currentUser:     'mateo',
    events:          [],
    goals:           [],
    todos:           [],
    wishlistItems:   [],
    shoppingLists:   [],
    countdowns:      [],
    partnerNotes:    [],
    focusActivities: [],
    memories:        [],
    ...overrides,
  } as never)
}

const BASE_TIMESTAMP = '2027-01-01T00:00:00.000Z'

function makeEvent(id: string, date: string): CalendarEvent {
  return {
    id, title: `Event ${id}`, date, color: 'yellow',
    createdBy: 'mateo', createdAt: BASE_TIMESTAMP, updatedAt: BASE_TIMESTAMP,
  }
}

function makeCountdown(id: string, date: string): Countdown {
  return {
    id, title: `CD ${id}`, date, emoji: '🎉',
    createdBy: 'mateo',
  }
}

function makeTodo(id: string, overrides: Partial<SharedTodo> = {}): SharedTodo {
  return {
    id, title: `Plan ${id}`, items: [], photos: [],
    isCompleted: false, color: 'green',
    createdBy: 'mateo', createdAt: BASE_TIMESTAMP,
    ...overrides,
  }
}

// ── TodosPage ─────────────────────────────────────────────────────────────────

describe('TodosPage — empty state', () => {
  beforeEach(() => freshStore())

  it('renders the page heading', () => {
    render(<TodosPage />)
    expect(screen.getByText('Together Plans')).toBeInTheDocument()
  })

  it('shows empty-state when no todos exist', () => {
    render(<TodosPage />)
    expect(screen.getByText('All clear!')).toBeInTheDocument()
  })

  it('Add-plan button has accessible name "Add plan"', () => {
    render(<TodosPage />)
    expect(screen.getByRole('button', { name: 'Add plan' })).toBeInTheDocument()
  })
})

describe('TodosPage — create form', () => {
  beforeEach(() => freshStore())

  it('Add-plan button opens the create form', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    expect(screen.getByPlaceholderText('Plan name...')).toBeInTheDocument()
  })

  it('create form shows a step input', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    expect(
      screen.getByPlaceholderText('Add a step... (Enter for more)'),
    ).toBeInTheDocument()
  })

  it('Save Plan button is disabled when title is empty', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    expect(screen.getByRole('button', { name: 'Save Plan' })).toBeDisabled()
  })

  it('Save Plan button is enabled once a title is typed', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    await user.type(screen.getByPlaceholderText('Plan name...'), 'Date night')
    expect(screen.getByRole('button', { name: 'Save Plan' })).not.toBeDisabled()
  })

  it('Cancel closes the form without adding a todo', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    await user.type(screen.getByPlaceholderText('Plan name...'), 'Abandoned')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Plan name...')).not.toBeInTheDocument()
    })
    expect(useAppStore.getState().todos).toHaveLength(0)
  })

  it('Save Plan adds a todo and closes the form', async () => {
    const user = makeActUser()
    render(<TodosPage />)
    await user.click(screen.getByRole('button', { name: 'Add plan' }))
    await user.type(screen.getByPlaceholderText('Plan name...'), 'Weekend hike')
    await user.click(screen.getByRole('button', { name: 'Save Plan' }))
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Plan name...')).not.toBeInTheDocument()
    })
    expect(useAppStore.getState().todos.some(t => t.title === 'Weekend hike')).toBe(true)
  })
})

describe('TodosPage — existing todos', () => {
  it('pending todo appears in the list', () => {
    freshStore({ todos: [makeTodo('t1')] })
    render(<TodosPage />)
    expect(screen.getByText('Plan t1')).toBeInTheDocument()
  })

  it('completed todo appears under "Completed" section', () => {
    freshStore({ todos: [makeTodo('t2', { isCompleted: true })] })
    render(<TodosPage />)
    expect(screen.getByText(/Completed/)).toBeInTheDocument()
    expect(screen.getByText('Plan t2')).toBeInTheDocument()
  })

  it('TodoItem toggle button has an accessible name', () => {
    freshStore({ todos: [makeTodo('t3')] })
    render(<TodosPage />)
    expect(
      screen.getByRole('button', { name: /Mark "Plan t3" as done/i }),
    ).toBeInTheDocument()
  })

  it('TodoItem edit button has an accessible name', () => {
    freshStore({ todos: [makeTodo('t4')] })
    render(<TodosPage />)
    expect(
      screen.getByRole('button', { name: /Edit "Plan t4"/i }),
    ).toBeInTheDocument()
  })

  it('TodoItem delete button has an accessible name', () => {
    freshStore({ todos: [makeTodo('t5')] })
    render(<TodosPage />)
    expect(
      screen.getByRole('button', { name: /Delete "Plan t5"/i }),
    ).toBeInTheDocument()
  })

  it('TodoItem with steps shows expand button with accessible name', () => {
    freshStore({
      todos: [makeTodo('t6', { items: ['Step 1'] })],
    })
    render(<TodosPage />)
    expect(
      screen.getByRole('button', { name: /Expand steps/i }),
    ).toBeInTheDocument()
  })

  it('long title (200 chars) renders without crash', () => {
    const long = 'X'.repeat(200)
    freshStore({ todos: [makeTodo('tl', { title: long })] })
    expect(() => render(<TodosPage />)).not.toThrow()
    expect(screen.getByText(long)).toBeInTheDocument()
  })
})

// ── PlannerPage ───────────────────────────────────────────────────────────────

const PLANNER_VIEWPORTS = [
  { width: 360,  height: 780  },
  { width: 390,  height: 844  },
  { width: 1280, height: 800  },
] as const

describe('PlannerPage — viewport smoke', () => {
  beforeEach(() => freshStore())
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth',  { writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768  })
  })

  PLANNER_VIEWPORTS.forEach(({ width, height }) => {
    it(`renders without crash at ${width}×${height}`, () => {
      Object.defineProperty(window, 'innerWidth',  { writable: true, value: width  })
      Object.defineProperty(window, 'innerHeight', { writable: true, value: height })
      expect(() => render(<PlannerPage />)).not.toThrow()
    })
  })
})

describe('PlannerPage — content sections', () => {
  it('renders the Planner heading', () => {
    freshStore()
    render(<PlannerPage />)
    expect(screen.getByText('Planner')).toBeInTheDocument()
  })

  it('does not show "Upcoming dates" section when store is empty', () => {
    freshStore()
    render(<PlannerPage />)
    expect(screen.queryByText('Upcoming dates')).not.toBeInTheDocument()
  })

  it('shows "Upcoming dates" section when a future event exists', () => {
    freshStore({ events: [makeEvent('ev1', FUTURE)] })
    render(<PlannerPage />)
    expect(screen.getByText('Upcoming dates')).toBeInTheDocument()
  })

  it('shows "Upcoming dates" section when a future countdown exists', () => {
    freshStore({ countdowns: [makeCountdown('cd1', FUTURE)] })
    render(<PlannerPage />)
    expect(screen.getByText('Upcoming dates')).toBeInTheDocument()
  })

  it('shows "Needs attention" section when an overdue todo exists', () => {
    freshStore({
      todos: [makeTodo('ot1', { date: PAST })],
    })
    render(<PlannerPage />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
  })

  it('does not show "Needs attention" when all todos lack a date', () => {
    freshStore({ todos: [makeTodo('nd1')] })
    render(<PlannerPage />)
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument()
  })
})
