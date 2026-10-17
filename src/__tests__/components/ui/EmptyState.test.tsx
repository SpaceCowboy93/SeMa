/**
 * Component tests for src/components/ui/EmptyState.tsx
 *
 * Tests: title, description, optional action, icon, DashedEmptyState
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmptyState, DashedEmptyState } from '@/components/ui/EmptyState'
import { Heart } from '@/design/iconSystem'

// ── EmptyState ────────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState icon={Heart} title="No items yet" />)
    expect(screen.getByText('No items yet')).toBeInTheDocument()
  })

  it('renders the optional description', () => {
    render(<EmptyState icon={Heart} title="Empty" description="Nothing here yet" />)
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('does not render description when not provided', () => {
    render(<EmptyState icon={Heart} title="Empty" />)
    // If description is missing the p should not be there
    const ps = document.querySelectorAll('p')
    // Only the title p should be present
    const texts = Array.from(ps).map(p => p.textContent)
    expect(texts.some(t => t === '')).toBe(false)
  })

  it('renders action button when action prop is provided', () => {
    render(
      <EmptyState
        icon={Heart}
        title="No notes"
        action={{ label: 'Write one', onClick: vi.fn() }}
      />,
    )
    expect(screen.getByRole('button', { name: 'Write one' })).toBeInTheDocument()
  })

  it('does not render action button when action is not provided', () => {
    render(<EmptyState icon={Heart} title="Empty" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls action.onClick when action button is clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={Heart}
        title="No notes"
        action={{ label: 'Add first', onClick }}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Add first' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

// ── DashedEmptyState ──────────────────────────────────────────────────────────

describe('DashedEmptyState', () => {
  it('renders title', () => {
    render(<DashedEmptyState icon={Heart} title="Add first item" />)
    expect(screen.getByText('Add first item')).toBeInTheDocument()
  })

  it('renders as a button when onClick is provided', () => {
    render(<DashedEmptyState icon={Heart} title="Add" onClick={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('renders as a div when no onClick', () => {
    const { container } = render(<DashedEmptyState icon={Heart} title="Placeholder" />)
    // Without onClick, it should render a div, not a button
    expect(container.querySelector('div')).toBeTruthy()
    // The outer container should not be a button
    const outerEl = container.firstChild as HTMLElement
    expect(outerEl.tagName.toLowerCase()).toBe('div')
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<DashedEmptyState icon={Heart} title="Add item" onClick={onClick} />)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
