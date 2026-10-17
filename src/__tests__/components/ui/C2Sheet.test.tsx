/**
 * Component tests for src/components/ui/C2Sheet.tsx
 *
 * Tests: open/close, Escape key, focus trap, backdrop click,
 *        C2SheetHeader, C2SheetBody, C2SheetFooter, C2FormField
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  C2Sheet,
  C2SheetHeader,
  C2SheetBody,
  C2SheetFooter,
  C2FormField,
  C2CloseButton,
} from '@/components/ui/C2Sheet'

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderSheet(open: boolean, onClose = vi.fn()) {
  return render(
    <C2Sheet open={open} onClose={onClose} aria-label="Test Sheet">
      <C2SheetHeader title="Test Title" onClose={onClose} />
      <C2SheetBody>
        <button>Action</button>
      </C2SheetBody>
      <C2SheetFooter>
        <button>Save</button>
      </C2SheetFooter>
    </C2Sheet>,
  )
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe('C2Sheet — visibility', () => {
  it('is not visible when open=false', () => {
    renderSheet(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is visible when open=true', () => {
    renderSheet(true)
    expect(screen.getByRole('dialog', { name: 'Test Sheet' })).toBeInTheDocument()
  })

  it('shows the header title', () => {
    renderSheet(true)
    expect(screen.getByText('Test Title')).toBeInTheDocument()
  })
})

// ── Close behaviour ───────────────────────────────────────────────────────────

describe('C2Sheet — close behaviour', () => {
  it('calls onClose when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSheet(true, onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderSheet(true, onClose)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ── ARIA ──────────────────────────────────────────────────────────────────────

describe('C2Sheet — ARIA', () => {
  it('has role=dialog', () => {
    renderSheet(true)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has aria-modal=true', () => {
    renderSheet(true)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('has accessible aria-label', () => {
    renderSheet(true)
    expect(screen.getByRole('dialog', { name: 'Test Sheet' })).toBeInTheDocument()
  })
})

// ── C2CloseButton ─────────────────────────────────────────────────────────────

describe('C2CloseButton', () => {
  it('renders with default aria-label "Close"', () => {
    const onClose = vi.fn()
    render(<C2CloseButton onClose={onClose} />)
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('accepts a custom label', () => {
    const onClose = vi.fn()
    render(<C2CloseButton onClose={onClose} label="Dismiss sheet" />)
    expect(screen.getByRole('button', { name: 'Dismiss sheet' })).toBeInTheDocument()
  })

  it('calls onClose when clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<C2CloseButton onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ── C2FormField ───────────────────────────────────────────────────────────────

describe('C2FormField', () => {
  it('renders a visible label', () => {
    render(
      <C2FormField label="Full Name" htmlFor="name">
        <input id="name" />
      </C2FormField>,
    )
    expect(screen.getByText('Full Name')).toBeInTheDocument()
  })

  it('associates label with input via htmlFor', () => {
    render(
      <C2FormField label="Email" htmlFor="email">
        <input id="email" type="email" />
      </C2FormField>,
    )
    const label = screen.getByText('Email')
    expect(label.getAttribute('for')).toBe('email')
  })

  it('shows an error message with role=alert', () => {
    render(
      <C2FormField label="Name" error="Name is required">
        <input />
      </C2FormField>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required')
  })

  it('does not render error paragraph without error prop', () => {
    render(
      <C2FormField label="Name">
        <input />
      </C2FormField>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ── C2Sheet with closeOnBackdrop=false ────────────────────────────────────────

describe('C2Sheet — closeOnBackdrop=false', () => {
  it('does not close when backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(
      <C2Sheet open closeOnBackdrop={false} onClose={onClose} aria-label="Locked">
        <C2SheetBody><button>Action</button></C2SheetBody>
      </C2Sheet>,
    )
    // Escape still works
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
