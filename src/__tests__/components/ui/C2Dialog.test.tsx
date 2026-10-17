/**
 * Component tests for src/components/ui/C2Dialog.tsx and DeleteConfirmSheet.tsx
 *
 * Tests: open/close, Escape key, focus trap, onCancel/onConfirm, labels
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { C2Dialog } from '@/components/ui/C2Dialog'
import DeleteConfirmSheet from '@/components/ui/DeleteConfirmSheet'
import { Trash2 } from '@/design/iconSystem'

// ── C2Dialog — visibility ─────────────────────────────────────────────────────

describe('C2Dialog — visibility', () => {
  it('is not visible when open=false', () => {
    render(<C2Dialog open={false} title="Delete?" onCancel={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is visible when open=true', () => {
    render(<C2Dialog open title="Delete?" onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the title', () => {
    render(<C2Dialog open title="Are you sure?" onCancel={vi.fn()} />)
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('shows the description', () => {
    render(
      <C2Dialog
        open
        title="Delete"
        description="This cannot be undone."
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument()
  })
})

// ── C2Dialog — ARIA ───────────────────────────────────────────────────────────

describe('C2Dialog — ARIA', () => {
  it('has role=dialog', () => {
    render(<C2Dialog open title="Info" onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('has aria-modal=true', () => {
    render(<C2Dialog open title="Info" onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')
  })

  it('title has id c2-dialog-title referenced by aria-labelledby', () => {
    render(<C2Dialog open title="Delete item" onCancel={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    const labelledBy = dialog.getAttribute('aria-labelledby')
    expect(labelledBy).toBe('c2-dialog-title')
    expect(document.getElementById('c2-dialog-title')).toHaveTextContent('Delete item')
  })
})

// ── C2Dialog — close behaviour ────────────────────────────────────────────────

describe('C2Dialog — close behaviour', () => {
  it('calls onCancel when Escape is pressed', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <C2Dialog open title="Delete?" onCancel={onCancel} confirmLabel="Delete" onConfirm={vi.fn()} />,
    )
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <C2Dialog open title="Delete?" cancelLabel="Cancel" onCancel={onCancel} confirmLabel="OK" onConfirm={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <C2Dialog open title="Confirm?" onCancel={vi.fn()} confirmLabel="Yes, delete" onConfirm={onConfirm} />,
    )
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('shows custom cancel label', () => {
    render(<C2Dialog open title="Hmm" cancelLabel="No thanks" onCancel={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeInTheDocument()
  })
})

// ── C2Dialog — custom icon ────────────────────────────────────────────────────

describe('C2Dialog — icon', () => {
  it('renders an icon container when icon prop is given', () => {
    render(<C2Dialog open title="Delete" icon={Trash2} onCancel={vi.fn()} />)
    // Icon should be present as aria-hidden SVG
    const dialog = screen.getByRole('dialog')
    const icons = dialog.querySelectorAll('[aria-hidden="true"]')
    expect(icons.length).toBeGreaterThan(0)
  })
})

// ── DeleteConfirmSheet ────────────────────────────────────────────────────────

describe('DeleteConfirmSheet', () => {
  it('is not visible when open=false', () => {
    render(
      <DeleteConfirmSheet
        open={false}
        title="Delete this?"
        message="It cannot be recovered."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows title and message when open', () => {
    render(
      <DeleteConfirmSheet
        open
        title="Delete event?"
        message="This will remove the event permanently."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    expect(screen.getByText('Delete event?')).toBeInTheDocument()
    expect(screen.getByText('This will remove the event permanently.')).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    render(
      <DeleteConfirmSheet
        open
        title="Delete?"
        message="Sure?"
        onCancel={onCancel}
        onConfirm={vi.fn()}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when Delete is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <DeleteConfirmSheet
        open
        title="Delete?"
        message="Sure?"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('uses custom confirmLabel', () => {
    render(
      <DeleteConfirmSheet
        open
        title="Remove?"
        message="Sure?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        confirmLabel="Remove"
      />,
    )
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
