/**
 * Component regression tests for EventModal — DEF-2 root-cause fixes.
 *
 * These tests render the actual EventModal component and interact with its
 * UI controls to verify the two defects are fixed and do not regress:
 *
 *   ROOT CAUSE A — mid-edit state wipe (hydration defect)
 *     EventModal's hydration useEffect previously depended on `goals`.
 *     Any Supabase sync (~5 s cadence) replaced the Zustand goals array
 *     reference, re-ran the effect, and reset all form state to the
 *     original event values — silently wiping the user's draft.
 *     Fix: guard initialization with a session-key ref; read goals via
 *     getState() snapshot instead of a live subscription.
 *
 *   ROOT CAUSE B — uncommitted newTodo discarded (UI affordance defect)
 *     Typing text into "Add item..." does NOT add it to the `todos` array
 *     until the user presses Enter or clicks +.  handleSave previously read
 *     only `todos`, so text typed but not committed was silently lost.
 *     Fix: auto-commit any pending newTodo trim before building the payload.
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/store/useAppStore'
import { EventModal } from '@/components/calendar/EventModal'
import type { CalendarEvent } from '@/types'

// Wrap userEvent in act() so React 18's concurrent scheduler (setImmediate-based)
// fully flushes before each await returns. Without this, scheduler callbacks fire
// between await points — outside act() context — generating act() warnings.
function makeActUser() {
  const setup = userEvent.setup({ delay: null })
  return {
    type: (el: Element, text: string) =>
      act(async () => { await setup.type(el, text) }),
    click: (el: Element) =>
      act(async () => { await setup.click(el) }),
  }
}

// ── Shared test fixture ────────────────────────────────────────────────────────

const BASE_EVENT: CalendarEvent = {
  id:        'ev-modal-test',
  title:     'Friday Dinner',
  date:      '2027-03-19',
  color:     'yellow',
  createdBy: 'mateo',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
}

function freshStore(extraEvents: CalendarEvent[] = []) {
  useAppStore.setState({
    currentUser: 'mateo',
    events:      [BASE_EVENT, ...extraEvents],
    goals:       [],
    todos:       [],
  } as never)
}

function savedEvent() {
  return useAppStore.getState().events.find(e => e.id === BASE_EVENT.id)!
}

// Simulate a Zustand goals update (e.g. arriving from Supabase sync mid-edit).
async function triggerGoalsSync(idSuffix: string) {
  await act(async () => {
    useAppStore.setState({
      goals: [
        {
          id: `g-sync-${idSuffix}`, title: 'Synced Goal', isCompleted: false,
          category: 'life', targetDate: '2028-01-01',
          checklist: [], photos: [],
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          createdBy: 'mateo',
        },
      ],
    } as never)
  })
}

// Helper: render the modal open in edit mode.
// Uses async act so that all passive effects (overlay + init) and any
// Zustand useSyncExternalStore subscription checks are fully flushed
// before the test makes its first assertion.
async function renderModal(onClose = vi.fn()) {
  const user = makeActUser()
  await act(async () => {
    render(
      <EventModal
        isOpen={true}
        onClose={onClose}
        date={BASE_EVENT.date}
        event={BASE_EVENT}
      />,
    )
  })
  return { user, onClose }
}

// ── Happy path (must pass before AND after the fix) ───────────────────────────

describe('EventModal: happy path (notes via textarea + todo committed with Enter)', () => {
  beforeEach(() => freshStore())

  it('saves notes typed in the textarea', async () => {
    const { user } = await renderModal()

    const notesArea = screen.getByPlaceholderText('Add notes...')
    await user.click(notesArea)
    await user.type(notesArea, 'Reservation at 8pm')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(savedEvent().notes).toBe('Reservation at 8pm')
  })

  it('saves a checklist item committed with Enter before clicking Save', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Confirm reservation{Enter}')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.todos).toHaveLength(1)
    expect(ev.todos![0].title).toBe('Confirm reservation')
  })

  it('saves both notes and a committed todo together', async () => {
    const { user } = await renderModal()

    await user.click(screen.getByPlaceholderText('Add notes...'))
    await user.type(screen.getByPlaceholderText('Add notes...'), 'Reservation at 8pm')

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Confirm reservation{Enter}')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.notes).toBe('Reservation at 8pm')
    expect(ev.todos).toHaveLength(1)
    expect(ev.todos![0].title).toBe('Confirm reservation')
  })
})

// ── ROOT CAUSE A: goals update mid-edit must not wipe in-progress state ────────

describe('EventModal: ROOT CAUSE A — mid-edit goals sync must not wipe form state', () => {
  beforeEach(() => freshStore())

  it('notes typed in the textarea survive a Zustand goals update', async () => {
    const { user } = await renderModal()

    const notesArea = screen.getByPlaceholderText('Add notes...')
    await user.click(notesArea)
    await user.type(notesArea, 'Important dinner notes')
    expect(notesArea).toHaveValue('Important dinner notes')

    // Simulate Supabase sync arriving while the user is editing
    await triggerGoalsSync('a1')

    expect(notesArea).toHaveValue('Important dinner notes')
  })

  it('in-progress newTodo text survives a Zustand goals update', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Book the venue')
    expect(todoInput).toHaveValue('Book the venue')

    await triggerGoalsSync('a2')

    expect(todoInput).toHaveValue('Book the venue')
  })

  it('committed todos are not cleared when Zustand goals updates', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Pick up flowers{Enter}')

    // Committed todos render as spans, not inputs
    expect(screen.getByText('Pick up flowers')).toBeInTheDocument()

    await triggerGoalsSync('a3')

    expect(screen.getByText('Pick up flowers')).toBeInTheDocument()
  })
})

// ── ROOT CAUSE B: uncommitted newTodo text must be auto-saved ─────────────────

describe('EventModal: ROOT CAUSE B — uncommitted newTodo text is auto-committed on Save', () => {
  beforeEach(() => freshStore())

  it('typing a checklist item and clicking Save without Enter saves the item', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Confirm reservation')
    // Do NOT press Enter — testing the mobile tap-Save path

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.todos).toHaveLength(1)
    expect(ev.todos![0].title).toBe('Confirm reservation')
  })

  it('partial newTodo text is merged with already-committed todos on Save', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'First item{Enter}')

    // Start typing second item but do NOT press Enter
    await user.type(todoInput, 'Second item')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.todos).toHaveLength(2)
    expect(ev.todos!.map(t => t.title)).toEqual(['First item', 'Second item'])
  })

  it('whitespace-only newTodo is not added to the saved todos', async () => {
    const { user } = await renderModal()

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, '   ')

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.todos).toBeUndefined()
  })
})

// ── Combined: full user journey (both bugs together) ─────────────────────────

describe('EventModal: combined — notes + uncommitted todo saved, survive goals sync', () => {
  beforeEach(() => freshStore())

  it('notes and a pending todo typed mid-sync are both saved correctly', async () => {
    const { user } = await renderModal()

    const notesArea = screen.getByPlaceholderText('Add notes...')
    await user.click(notesArea)
    await user.type(notesArea, 'Valentines dinner')

    const todoInput = screen.getByPlaceholderText('Add item...')
    await user.click(todoInput)
    await user.type(todoInput, 'Book restaurant')

    // Supabase sync arrives mid-edit
    await triggerGoalsSync('combined')

    // User taps Save (no Enter before)
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const ev = savedEvent()
    expect(ev.notes).toBe('Valentines dinner')
    expect(ev.todos).toHaveLength(1)
    expect(ev.todos![0].title).toBe('Book restaurant')
  })
})

// ── Closing and reopening reloads the latest saved data ──────────────────────

describe('EventModal: close and reopen reloads the latest saved values', () => {
  beforeEach(() => freshStore())

  it('reopening the same event shows the notes saved in the previous session', async () => {
    const user = makeActUser()
    let rerender!: ReturnType<typeof render>['rerender']
    await act(async () => {
      const result = render(
        <EventModal
          isOpen={true}
          onClose={vi.fn()}
          date={BASE_EVENT.date}
          event={BASE_EVENT}
        />,
      )
      rerender = result.rerender
    })

    // Type notes and save
    await user.type(screen.getByPlaceholderText('Add notes...'), 'Saved note')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    // Parent closes the modal (isOpen=false resets the session guard)
    rerender(
      <EventModal
        isOpen={false}
        onClose={vi.fn()}
        date={BASE_EVENT.date}
        event={savedEvent()}
      />,
    )

    // Parent reopens with the now-updated event
    rerender(
      <EventModal
        isOpen={true}
        onClose={vi.fn()}
        date={BASE_EVENT.date}
        event={savedEvent()}
      />,
    )

    expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('Saved note')
  })
})

// ── Opening a different event hydrates the correct values ─────────────────────

describe('EventModal: switching to a different event hydrates fresh values', () => {
  beforeEach(() => freshStore())

  it('shows the new event notes when the event prop changes', async () => {
    const EVENT_B: CalendarEvent = {
      id:        'ev-modal-b',
      title:     'Saturday Lunch',
      date:      BASE_EVENT.date,
      color:     'blue',
      notes:     'Notes from event B',
      createdBy: 'mateo',
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
    }
    useAppStore.setState({ events: [BASE_EVENT, EVENT_B] } as never)

    let rerender!: ReturnType<typeof render>['rerender']
    await act(async () => {
      const result = render(
        <EventModal
          isOpen={true}
          onClose={vi.fn()}
          date={BASE_EVENT.date}
          event={BASE_EVENT}
        />,
      )
      rerender = result.rerender
    })

    // BASE_EVENT has no notes
    expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('')

    // Parent switches to a different event
    await act(async () => {
      rerender(
        <EventModal
          isOpen={true}
          onClose={vi.fn()}
          date={EVENT_B.date}
          event={EVENT_B}
        />,
      )
    })

    expect(screen.getByPlaceholderText('Add notes...')).toHaveValue('Notes from event B')
  })
})

// ── Linked Goal checklist synchronization ────────────────────────────────────

describe('EventModal: linked Goal checklist is shown and saved back to the Goal', () => {
  beforeEach(() => freshStore())

  it('renders checklist from the linked Goal and writes it back on Save', async () => {
    const user = makeActUser()

    const LINKED_EVENT: CalendarEvent = {
      ...BASE_EVENT,
      id:            'ev-linked-1',
      linkedGoalId:  'goal-link-1',
    }

    // Set store state directly before render — same pattern as freshStore().
    // Wrapping pre-render setState in act() leaves stale flush state that
    // conflicts with RTL's internal act() during render, producing warnings.
    useAppStore.setState({
      goals: [
        {
          id: 'goal-link-1', title: 'Paris Trip', isCompleted: false,
          category: 'life', targetDate: '2028-06-01',
          checklist: ['Book flights', 'Get visa'],
          photos: [],
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          createdBy: 'mateo',
        },
      ],
      events: [BASE_EVENT, LINKED_EVENT],
    } as never)

    render(
      <EventModal
        isOpen={true}
        onClose={vi.fn()}
        date={LINKED_EVENT.date}
        event={LINKED_EVENT}
      />,
    )

    // findByText (async) flushes the init-effect's setTodos call within act
    // before we make synchronous assertions, eliminating act() warnings.
    expect(await screen.findByText('Book flights')).toBeInTheDocument()
    expect(screen.getByText('Get visa')).toBeInTheDocument()

    // Save syncs the checklist back to the Goal
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    const goal = useAppStore.getState().goals.find(g => g.id === 'goal-link-1')
    expect(goal?.checklist).toEqual(['Book flights', 'Get visa'])
  })

  it('Goal checklist survives a background goals sync after modal opens', async () => {
    const user = makeActUser()

    const LINKED_EVENT: CalendarEvent = {
      ...BASE_EVENT,
      id:           'ev-linked-2',
      linkedGoalId: 'goal-link-2',
    }

    useAppStore.setState({
      goals: [
        {
          id: 'goal-link-2', title: 'Road Trip', isCompleted: false,
          category: 'life', targetDate: '2028-06-01',
          checklist: ['Pack car', 'Book hotel'],
          photos: [],
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          createdBy: 'mateo',
        },
      ],
      events: [BASE_EVENT, LINKED_EVENT],
    } as never)

    render(
      <EventModal
        isOpen={true}
        onClose={vi.fn()}
        date={LINKED_EVENT.date}
        event={LINKED_EVENT}
      />,
    )

    expect(await screen.findByText('Pack car')).toBeInTheDocument()
    expect(screen.getByText('Book hotel')).toBeInTheDocument()

    // Another sync arrives (unrelated goal update)
    await act(async () => {
      // Keep the linked Goal: deleting it is a different, conflicting operation.
      useAppStore.setState({ goals: [...useAppStore.getState().goals, {
        id: 'unrelated-goal', title: 'Unrelated', isCompleted: false,
      } as never] })
    })

    // Checklist rows must still be present — the sync must not wipe them
    expect(screen.getByText('Pack car')).toBeInTheDocument()
    expect(screen.getByText('Book hotel')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    // Unchanged Save leaves the sparse legacy event intact; its Goal fallback remains.
    const ev = useAppStore.getState().events.find(e => e.id === 'ev-linked-2')!
    expect(ev.todos).toBeUndefined()
    expect(useAppStore.getState().goals.find(g => g.id === 'goal-link-2')?.checklist).toEqual(['Pack car', 'Book hotel'])
  })
})
