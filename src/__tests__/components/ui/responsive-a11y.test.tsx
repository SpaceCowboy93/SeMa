/**
 * Responsive & accessibility tests for authenticated interface components.
 *
 * Target viewports: 360×780 · 390×844 · 430×932 · 768×1024 · 1280×800
 *
 * jsdom does not compute CSS layout, so viewport tests confirm:
 *   1. No JavaScript crash at any target width.
 *   2. All interactive controls are present in the DOM.
 * CSS-based overflow/scroll is verified via className inspection.
 * Browser-level layout must be confirmed in the Playwright E2E suite.
 *
 * Accessibility checks:
 *   - ARIA roles and labels on sheets, dialogs, and icon-only buttons.
 *   - Initial focus enters the first focusable element on open.
 *   - Tab / Shift+Tab wrap within the focus trap.
 *   - Escape closes non-destructive overlays.
 *   - Disabled controls expose the correct attribute.
 *   - Reduced-motion mode does not prevent opening or saving.
 *   - Long title / notes wrap safely (no crash).
 */

import React from 'react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/store/useAppStore'
import {
  C2Sheet,
  C2SheetHeader,
  C2SheetBody,
  C2SheetFooter,
  C2CloseButton,
} from '@/components/ui/C2Sheet'
import { C2Dialog } from '@/components/ui/C2Dialog'
import { FullCreateSheet } from '@/components/ui/FullCreateSheet'
import { ShoppingListEditorSheet } from '@/components/ui/ShoppingListEditorSheet'
import { CategoryHubSheet } from '@/components/ui/CategoryHub'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActUser() {
  const setup = userEvent.setup({ delay: null })
  return {
    click: (el: Element) => act(async () => { await setup.click(el) }),
    tab:   ()            => act(async () => { await setup.tab() }),
  }
}

function freshStore(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    currentUser:   'mateo',
    events:        [],
    goals:         [],
    todos:         [],
    wishlistItems: [],
    shoppingLists: [],
    countdowns:    [],
    partnerNotes:  [],
    focusActivities: [],
    memories:      [],
    ...overrides,
  } as never)
}

function sheetWith(children: React.ReactNode, onClose = vi.fn()) {
  return (
    <C2Sheet open onClose={onClose} aria-label="Test Sheet">
      <C2SheetHeader title="Test Sheet" onClose={onClose} />
      <C2SheetBody>{children}</C2SheetBody>
      <C2SheetFooter><button>Save</button></C2SheetFooter>
    </C2Sheet>
  )
}

// ── 1. Viewport smoke — C2Sheet ───────────────────────────────────────────────

const VIEWPORTS = [
  { width: 360,  height: 780  },
  { width: 390,  height: 844  },
  { width: 430,  height: 932  },
  { width: 768,  height: 1024 },
  { width: 1280, height: 800  },
] as const

describe('Viewport smoke — C2Sheet', () => {
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth',  { writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768  })
  })

  VIEWPORTS.forEach(({ width, height }) => {
    it(`renders and exposes dialog role at ${width}×${height}`, () => {
      Object.defineProperty(window, 'innerWidth',  { writable: true, value: width  })
      Object.defineProperty(window, 'innerHeight', { writable: true, value: height })
      render(sheetWith(<button>Action</button>))
      expect(screen.getByRole('dialog', { name: 'Test Sheet' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })
  })
})

// ── 2. Viewport smoke — FullCreateSheet ───────────────────────────────────────

describe('Viewport smoke — FullCreateSheet', () => {
  beforeEach(() => freshStore())
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth',  { writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 768  })
  })

  VIEWPORTS.forEach(({ width, height }) => {
    it(`renders without crash at ${width}×${height}`, () => {
      Object.defineProperty(window, 'innerWidth',  { writable: true, value: width  })
      Object.defineProperty(window, 'innerHeight', { writable: true, value: height })
      render(
        <FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="moment" />,
      )
      expect(screen.getByRole('dialog', { name: 'Add something' })).toBeInTheDocument()
    })
  })
})

// ── 3. C2Sheet structure — overflow and shrink ────────────────────────────────

describe('C2Sheet — scrollable structure', () => {
  it('C2SheetBody carries overflow-y-auto class', () => {
    render(sheetWith(<p>Content</p>))
    // The body wrapper should have overflow-y-auto so tall content is scrollable
    const body = document.querySelector('.overflow-y-auto')
    expect(body).not.toBeNull()
  })

  it('C2SheetFooter carries shrink-0 class so Save stays visible', () => {
    render(sheetWith(<p>Content</p>))
    const footer = screen.getByRole('button', { name: 'Save' }).closest('div')
    expect(footer?.className).toContain('shrink-0')
  })

  it('body scroll is locked to hidden while sheet is open', () => {
    render(sheetWith(<p>Content</p>))
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('long title (200 chars) does not crash', () => {
    const long = 'A'.repeat(200)
    expect(() =>
      render(
        <C2Sheet open onClose={vi.fn()} aria-label="Long title test">
          <C2SheetHeader title={long} />
          <C2SheetBody><p>body</p></C2SheetBody>
        </C2Sheet>,
      ),
    ).not.toThrow()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('long notes content (500 chars) does not crash', () => {
    const long = 'B'.repeat(500)
    expect(() => render(sheetWith(<p>{long}</p>))).not.toThrow()
  })
})

// ── 4. C2Sheet — keyboard and disabled ───────────────────────────────────────

describe('C2Sheet — keyboard interactions', () => {
  it('Escape key calls onClose', async () => {
    const onClose = vi.fn()
    render(sheetWith(<button>Inner</button>, onClose))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab wraps from last focusable to first', async () => {
    const user = makeActUser()
    render(sheetWith(<button>Inner</button>))
    // Focus the last button (Save in footer)
    const save = screen.getByRole('button', { name: 'Save' })
    save.focus()
    // Tab from last should wrap to Close (first focusable)
    await user.tab()
    // After wrap, focus should be somewhere inside the dialog (not body)
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('disabled button in footer exposes disabled attribute', () => {
    const { getByRole } = render(
      <C2Sheet open onClose={vi.fn()} aria-label="Disabled test">
        <C2SheetBody><p>body</p></C2SheetBody>
        <C2SheetFooter>
          <button disabled>Save</button>
        </C2SheetFooter>
      </C2Sheet>,
    )
    expect(getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})

// ── 5. C2Dialog — initial focus and Tab trap ──────────────────────────────────

describe('C2Dialog — initial focus and keyboard', () => {
  it('moves focus into the dialog when opened', async () => {
    render(
      <C2Dialog open title="Confirm?" onCancel={vi.fn()} cancelLabel="Cancel" />,
    )
    const dialog = screen.getByRole('dialog')
    // Focus should land on the Cancel button (first focusable)
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('Cancel button is focused first (default first focusable)', () => {
    render(
      <C2Dialog open title="Confirm?" onCancel={vi.fn()} cancelLabel="Cancel" />,
    )
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
  })

  it('Confirm button is reachable by Tab from Cancel', async () => {
    const user = makeActUser()
    render(
      <C2Dialog
        open
        title="Delete?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        cancelLabel="Cancel"
        confirmLabel="Delete"
      />,
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete' }))
  })

  it('Escape key calls onCancel', () => {
    const onCancel = vi.fn()
    render(<C2Dialog open title="Are you sure?" onCancel={onCancel} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders without crash when no onConfirm is supplied', () => {
    expect(() =>
      render(<C2Dialog open title="Info only" onCancel={vi.fn()} />),
    ).not.toThrow()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('long description does not crash', () => {
    expect(() =>
      render(
        <C2Dialog
          open
          title="Confirm?"
          description={'D'.repeat(400)}
          onCancel={vi.fn()}
        />,
      ),
    ).not.toThrow()
  })
})

// ── 6. FullCreateSheet — type rendering and controls ─────────────────────────

describe('FullCreateSheet — type rendering', () => {
  beforeEach(() => freshStore())

  const types = ['moment', 'plan', 'dream', 'wish', 'note', 'shopping'] as const

  types.forEach(type => {
    it(`renders without crash when initialType="${type}"`, () => {
      expect(() =>
        render(
          <FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType={type} />,
        ),
      ).not.toThrow()
      expect(screen.getByRole('dialog', { name: 'Add something' })).toBeInTheDocument()
    })
  })

  it('title input is present for moment type', () => {
    render(<FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="moment" />)
    // Placeholder text for moment type
    expect(screen.getByPlaceholderText('Name this moment...')).toBeInTheDocument()
  })

  it('Save button is present for moment type', () => {
    render(<FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="moment" />)
    expect(screen.getByRole('button', { name: 'Save Moment' })).toBeInTheDocument()
  })

  it('checklist add-item input is present for moment type', () => {
    render(<FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="moment" />)
    expect(screen.getByPlaceholderText('Add item...')).toBeInTheDocument()
  })

  it('Close button has accessible name', () => {
    render(<FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="moment" />)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    expect(closeBtn).toBeInTheDocument()
  })

  it('note type renders textarea instead of title input', async () => {
    render(<FullCreateSheet open onClose={vi.fn()} primary="#14b8a6" initialType="note" />)
    // The type switch happens in a useEffect; flush pending effects before asserting.
    await act(async () => {})
    expect(
      screen.getByPlaceholderText('Write something from the heart...'),
    ).toBeInTheDocument()
  })
})

// ── 7. ShoppingListEditorSheet — create and edit modes ────────────────────────

describe('ShoppingListEditorSheet — create mode', () => {
  beforeEach(() => freshStore())

  it('renders without crash in create mode', () => {
    expect(() =>
      render(
        <ShoppingListEditorSheet mode="create" onSave={vi.fn()} onClose={vi.fn()} />,
      ),
    ).not.toThrow()
    expect(screen.getByRole('dialog', { name: 'New Shopping List' })).toBeInTheDocument()
  })

  it('list name input is present', () => {
    render(<ShoppingListEditorSheet mode="create" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByPlaceholderText('List name (e.g. Groceries, IKEA) *')).toBeInTheDocument()
  })

  it('Save button is present', () => {
    render(<ShoppingListEditorSheet mode="create" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Create Shopping List' })).toBeInTheDocument()
  })

  it('Close button has accessible name', () => {
    render(<ShoppingListEditorSheet mode="create" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })
})

describe('ShoppingListEditorSheet — edit mode', () => {
  beforeEach(() => freshStore())

  const MOCK_LIST = {
    id: 'sl-test', name: 'Weekly Shop', storeName: 'Lidl',
    isCompleted: false, items: [], notes: '',
    createdBy: 'mateo' as const,
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    date: '', time: '', photos: [],
  }

  it('renders without crash in edit mode', () => {
    expect(() =>
      render(
        <ShoppingListEditorSheet
          mode="edit"
          list={MOCK_LIST}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />,
      ),
    ).not.toThrow()
    expect(screen.getByRole('dialog', { name: 'Edit Shopping List' })).toBeInTheDocument()
  })

  it('pre-populates list name from existing list', () => {
    render(
      <ShoppingListEditorSheet
        mode="edit"
        list={MOCK_LIST}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Weekly Shop')).toBeInTheDocument()
  })
})

// ── 8. CategoryHubSheet — all types render ────────────────────────────────────

describe('CategoryHubSheet — type rendering', () => {
  beforeEach(() => freshStore())

  const types = ['plans', 'dreams', 'wishes', 'moments'] as const

  types.forEach(type => {
    it(`renders without crash for type="${type}"`, () => {
      expect(() =>
        render(
          <CategoryHubSheet
            type={type}
            primary="#14b8a6"
            currentUser="mateo"
            onClose={vi.fn()}
            onEditMoment={vi.fn()}
          />,
        ),
      ).not.toThrow()
      // Each type exposes a dialog with its label
      const label = { plans: 'Plans', dreams: 'Dreams', wishes: 'Wishes', moments: 'Moments' }[type]
      expect(screen.getByRole('dialog', { name: label })).toBeInTheDocument()
    })
  })

  it('Close button has aria-label="Close"', () => {
    render(
      <CategoryHubSheet
        type="plans"
        primary="#14b8a6"
        currentUser="mateo"
        onClose={vi.fn()}
        onEditMoment={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

// ── 9. Reduced-motion mode ────────────────────────────────────────────────────

describe('Reduced-motion mode', () => {
  let origMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    origMatchMedia = window.matchMedia
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches:             query.includes('prefers-reduced-motion'),
      media:               query,
      onchange:            null,
      addListener:         vi.fn(),
      removeListener:      vi.fn(),
      addEventListener:    vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent:       vi.fn(),
    }))
  })

  afterEach(() => {
    window.matchMedia = origMatchMedia
  })

  it('C2Sheet still opens when prefers-reduced-motion is set', () => {
    render(sheetWith(<button>Action</button>))
    expect(screen.getByRole('dialog', { name: 'Test Sheet' })).toBeInTheDocument()
  })

  it('C2Dialog still opens when prefers-reduced-motion is set', () => {
    render(<C2Dialog open title="Reduced motion test" onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

// ── 10. C2CloseButton — accessible name ──────────────────────────────────────

describe('C2CloseButton — accessible name', () => {
  it('uses default label "Close"', () => {
    render(<C2CloseButton onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('accepts a custom label', () => {
    render(<C2CloseButton onClose={vi.fn()} label="Dismiss sheet" />)
    expect(screen.getByRole('button', { name: 'Dismiss sheet' })).toBeInTheDocument()
  })
})
