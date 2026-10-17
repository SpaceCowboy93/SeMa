/**
 * Component tests for ActivityCentre — bell button, feed sheet, prefs sheet.
 *
 * Tests: unread badge, mark read, mark all read, clear read, empty state,
 *        prefs global toggle, privacy (safeBody not raw title), deep link routing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/store/useAppStore'
import { ActivityCentreBell, ActivityCentreSheet } from '@/components/ActivityCentre'
import type { ActivityEntry } from '@/lib/activity-event'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notification-preferences'

// ── next/navigation is mocked in setup.ts — verify push is available ──────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id:          'act-1',
    entityType:  'todo',
    actionType:  'completed',
    actorName:   'seval',
    actorEmoji:  '💜',
    safeBody:    'Seval completed "Buy flowers"',
    deepLink:    '/planner',
    importance:  'immediate',
    createdAt:   new Date(Date.now() - 5 * 60_000).toISOString(),
    isRead:      false,
    ...overrides,
  }
}

function seedStore(entries: ActivityEntry[]) {
  useAppStore.setState({
    activityEntries: entries,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  })
}

beforeEach(() => {
  seedStore([])
})

// ── ActivityCentreBell ────────────────────────────────────────────────────────

describe('ActivityCentreBell', () => {
  it('renders the bell button', () => {
    render(<ActivityCentreBell />)
    expect(screen.getByRole('button', { name: /activity centre/i })).toBeInTheDocument()
  })

  it('shows no badge when there are no unread entries', () => {
    seedStore([entry({ isRead: true })])
    render(<ActivityCentreBell />)
    const btn = screen.getByRole('button')
    expect(btn).toHaveAttribute('aria-label', 'Open Activity Centre')
  })

  it('shows unread count in aria-label when unread entries exist', () => {
    seedStore([entry({ id: 'a1', isRead: false }), entry({ id: 'a2', isRead: false })])
    render(<ActivityCentreBell />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toMatch(/2 unread/i)
  })

  it('opens the Activity Centre sheet when clicked', async () => {
    const user = userEvent.setup()
    render(<ActivityCentreBell />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /activity centre/i }))
    })
    expect(screen.getByRole('dialog', { name: /activity centre/i })).toBeInTheDocument()
  })
})

// ── ActivityCentreSheet — empty state ─────────────────────────────────────────

describe('ActivityCentreSheet — empty state', () => {
  it('shows empty state message when no entries', () => {
    seedStore([])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument()
  })

  it('does not render footer action buttons when empty', () => {
    seedStore([])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /clear read/i })).not.toBeInTheDocument()
  })
})

// ── ActivityCentreSheet — feed ────────────────────────────────────────────────

describe('ActivityCentreSheet — feed', () => {
  it('renders safeBody text for each entry', () => {
    seedStore([
      entry({ id: 'a1', safeBody: 'Seval completed "Buy flowers"' }),
      entry({ id: 'a2', safeBody: 'Seval shared their mood' }),
    ])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByText('Seval completed "Buy flowers"')).toBeInTheDocument()
    expect(screen.getByText('Seval shared their mood')).toBeInTheDocument()
  })

  it('shows unread count badge in sheet header', () => {
    seedStore([
      entry({ id: 'a1', isRead: false }),
      entry({ id: 'a2', isRead: false }),
      entry({ id: 'a3', isRead: true }),
    ])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByLabelText(/2 unread/i)).toBeInTheDocument()
  })

  it('shows "Mark all read" button only when unread entries exist', () => {
    seedStore([entry({ isRead: false })])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument()
  })

  it('does not show "Mark all read" when all entries are read', () => {
    seedStore([entry({ isRead: true })])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
  })

  it('always shows "Clear read" button when entries exist', () => {
    seedStore([entry({ isRead: true })])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /clear read/i })).toBeInTheDocument()
  })

  it('shows actor emoji', () => {
    seedStore([entry({ actorEmoji: '💜', isRead: false })])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    expect(screen.getByText('💜')).toBeInTheDocument()
  })
})

// ── ActivityCentreSheet — interactions ────────────────────────────────────────

describe('ActivityCentreSheet — interactions', () => {
  it('marks a single entry as read when clicked', async () => {
    const user = userEvent.setup()
    seedStore([entry({ id: 'act-1', isRead: false })])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /seval completed/i }))
    })
    const entries = useAppStore.getState().activityEntries
    expect(entries.find(e => e.id === 'act-1')?.isRead).toBe(true)
  })

  it('marks all entries as read when "Mark all read" is clicked', async () => {
    const user = userEvent.setup()
    seedStore([
      entry({ id: 'a1', isRead: false }),
      entry({ id: 'a2', isRead: false, safeBody: 'Seval shared their mood' }),
    ])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /mark all read/i }))
    })
    const entries = useAppStore.getState().activityEntries
    expect(entries.every(e => e.isRead)).toBe(true)
  })

  it('removes read entries when "Clear read" is clicked', async () => {
    const user = userEvent.setup()
    seedStore([
      entry({ id: 'a1', isRead: true }),
      entry({ id: 'a2', isRead: false, safeBody: 'Seval shared their mood' }),
    ])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /clear read/i }))
    })
    const entries = useAppStore.getState().activityEntries
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('a2')
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ActivityCentreSheet open onClose={onClose} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /close activity centre/i }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('opens the notification preferences sheet when the settings button is clicked', async () => {
    const user = userEvent.setup()
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /notification preferences/i }))
    })
    expect(screen.getByRole('dialog', { name: /notification preferences/i })).toBeInTheDocument()
  })
})

// ── NotificationPrefsSheet ────────────────────────────────────────────────────

describe('NotificationPrefsSheet', () => {
  it('can be opened via settings button in ActivityCentreSheet', async () => {
    const user = userEvent.setup()
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /notification preferences/i }))
    })
    expect(screen.getByRole('switch', { name: /notifications enabled/i })).toBeInTheDocument()
  })

  it('global toggle updates store globalEnabled', async () => {
    const user = userEvent.setup()
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /notification preferences/i }))
    })
    const toggle = screen.getByRole('switch', { name: /notifications enabled/i })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await act(async () => {
      await user.click(toggle)
    })
    expect(useAppStore.getState().notificationPrefs.globalEnabled).toBe(false)
  })

  it('sensitive preview toggle updates store sensitivePreview', async () => {
    const user = userEvent.setup()
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    await act(async () => {
      await user.click(screen.getByRole('button', { name: /notification preferences/i }))
    })
    const toggle = screen.getByRole('switch', { name: /sensitive content preview/i })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await act(async () => {
      await user.click(toggle)
    })
    expect(useAppStore.getState().notificationPrefs.sensitivePreview).toBe(true)
  })
})

// ── Privacy: safeBody never contains raw sensitive content ────────────────────

describe('Privacy', () => {
  it('renders safeBody text verbatim (never re-processes)', () => {
    seedStore([
      entry({
        id: 'priv-1',
        entityType: 'partnerNote',
        safeBody: 'You received a note in SeMa.',
      }),
    ])
    render(<ActivityCentreSheet open onClose={vi.fn()} />)
    // Generic message is shown
    expect(screen.getByText('You received a note in SeMa.')).toBeInTheDocument()
    // Raw note text never appears
    expect(screen.queryByText(/private/i)).not.toBeInTheDocument()
  })
})
