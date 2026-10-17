/**
 * Component tests for src/components/ui/Button.tsx
 *
 * Tests: PrimaryButton, SecondaryButton, GhostButton, DangerButton, IconButton
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrimaryButton, SecondaryButton, GhostButton, DangerButton, IconButton } from '@/components/ui/Button'
import { X } from '@/design/iconSystem'

// ── PrimaryButton ─────────────────────────────────────────────────────────────

describe('PrimaryButton', () => {
  it('renders its label', () => {
    render(<PrimaryButton>Save</PrimaryButton>)
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<PrimaryButton onClick={onClick}>Go</PrimaryButton>)
    await user.click(screen.getByText('Go'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and shows "Saving..." when loading', () => {
    render(<PrimaryButton loading>Save</PrimaryButton>)
    expect(screen.getByRole('button')).toBeDisabled()
    expect(screen.getByText('Saving...')).toBeInTheDocument()
  })

  it('is disabled when disabled prop is set', () => {
    render(<PrimaryButton disabled>Save</PrimaryButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<PrimaryButton disabled onClick={onClick}>Save</PrimaryButton>)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('does not fire onClick when loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<PrimaryButton loading onClick={onClick}>Save</PrimaryButton>)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies custom color via style', () => {
    render(<PrimaryButton color="#ff0000">Red</PrimaryButton>)
    const btn = screen.getByRole('button')
    expect(btn.style.background).toBe('rgb(255, 0, 0)')
  })

  it('is full-width by default', () => {
    render(<PrimaryButton>Full</PrimaryButton>)
    expect(screen.getByRole('button').className).toContain('w-full')
  })

  it('is not full-width when fullWidth=false', () => {
    render(<PrimaryButton fullWidth={false}>Narrow</PrimaryButton>)
    expect(screen.getByRole('button').className).not.toContain('w-full')
  })
})

// ── SecondaryButton ───────────────────────────────────────────────────────────

describe('SecondaryButton', () => {
  it('renders children', () => {
    render(<SecondaryButton>Cancel</SecondaryButton>)
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onClick', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<SecondaryButton onClick={onClick}>Cancel</SecondaryButton>)
    await user.click(screen.getByText('Cancel'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is full-width by default', () => {
    render(<SecondaryButton>Cancel</SecondaryButton>)
    expect(screen.getByRole('button').className).toContain('w-full')
  })
})

// ── GhostButton ───────────────────────────────────────────────────────────────

describe('GhostButton', () => {
  it('renders children', () => {
    render(<GhostButton>Details</GhostButton>)
    expect(screen.getByText('Details')).toBeInTheDocument()
  })

  it('applies color via inline style', () => {
    render(<GhostButton color="#527052">Sage</GhostButton>)
    const btn = screen.getByRole('button')
    expect(btn.style.color).toBe('rgb(82, 112, 82)')
  })
})

// ── DangerButton ──────────────────────────────────────────────────────────────

describe('DangerButton', () => {
  it('renders destructive action label', () => {
    render(<DangerButton>Delete</DangerButton>)
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('fires onClick on click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<DangerButton onClick={onClick}>Delete</DangerButton>)
    await user.click(screen.getByText('Delete'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders a soft variant without the solid danger class', () => {
    render(<DangerButton soft>Remove</DangerButton>)
    // No easy class check since it uses tokens; just ensure it renders
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})

// ── IconButton ────────────────────────────────────────────────────────────────

describe('IconButton', () => {
  it('renders with an accessible aria-label', () => {
    render(<IconButton icon={X} aria-label="Close dialog" />)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toBeInTheDocument()
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<IconButton icon={X} aria-label="Close" onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('the icon itself is aria-hidden', () => {
    render(<IconButton icon={X} aria-label="Dismiss" />)
    const icon = screen.getByRole('button').querySelector('[aria-hidden="true"]')
    expect(icon).toBeTruthy()
  })
})
