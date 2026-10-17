/**
 * Component tests for src/components/ui/C2Toast.tsx
 *
 * Tests: C2ToastRegion rendering, toast variants, dismiss action,
 *        C2InlineError, C2ErrorState
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { C2ToastRegion, C2InlineError, C2ErrorState } from '@/components/ui/C2Toast'
import { useToastStore } from '@/store/useToastStore'

// Reset toast store between tests
beforeEach(() => {
  act(() => {
    useToastStore.getState().dismissAll()
  })
})

// ── C2ToastRegion ─────────────────────────────────────────────────────────────

describe('C2ToastRegion', () => {
  it('renders without toasts (empty region)', () => {
    render(<C2ToastRegion />)
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument()
  })

  it('renders a success toast', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Saved successfully!', 'success')
    })
    expect(screen.getByText('Saved successfully!')).toBeInTheDocument()
  })

  it('renders an error toast', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Something went wrong', 'error')
    })
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders a warning toast', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Check this', 'warning')
    })
    expect(screen.getByText('Check this')).toBeInTheDocument()
  })

  it('renders an info toast', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('FYI', 'info')
    })
    expect(screen.getByText('FYI')).toBeInTheDocument()
  })

  it('dismisses toast when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Deletable toast', 'success', 0)
    })
    expect(screen.getByText('Deletable toast')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    await waitFor(() => {
      expect(screen.queryByText('Deletable toast')).not.toBeInTheDocument()
    })
  })

  it('toast has role=status for live region announcement', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Live update', 'info')
    })
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('toast has aria-live=polite', () => {
    render(<C2ToastRegion />)
    act(() => {
      useToastStore.getState().show('Polite announcement', 'info')
    })
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
  })
})

// ── C2InlineError ─────────────────────────────────────────────────────────────

describe('C2InlineError', () => {
  it('renders the error message', () => {
    render(<C2InlineError message="This field is required" />)
    expect(screen.getByText('This field is required')).toBeInTheDocument()
  })

  it('has role=alert', () => {
    render(<C2InlineError message="Error" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})

// ── C2ErrorState ──────────────────────────────────────────────────────────────

describe('C2ErrorState', () => {
  it('renders default title and message', () => {
    render(<C2ErrorState />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Please try again.')).toBeInTheDocument()
  })

  it('renders custom title and message', () => {
    render(<C2ErrorState title="Network Error" message="Check your connection." />)
    expect(screen.getByText('Network Error')).toBeInTheDocument()
    expect(screen.getByText('Check your connection.')).toBeInTheDocument()
  })

  it('renders retry button when onRetry is provided', () => {
    render(<C2ErrorState onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('does not render retry button when no onRetry', () => {
    render(<C2ErrorState />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('calls onRetry when retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<C2ErrorState onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has role=alert', () => {
    render(<C2ErrorState />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
