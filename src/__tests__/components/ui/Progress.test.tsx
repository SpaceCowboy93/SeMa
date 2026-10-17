/**
 * Component tests for src/components/ui/Progress.tsx
 *
 * Tests: value clamping, variants, custom color, height, ProgressWithLabel
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { screen } from '@testing-library/react'
import { Progress, ProgressWithLabel } from '@/components/ui/Progress'

// ── Progress ──────────────────────────────────────────────────────────────────

describe('Progress', () => {
  it('renders without crashing', () => {
    const { container } = render(<Progress value={50} />)
    expect(container.firstChild).toBeInTheDocument()
  })

  it('clamps value above 100 to 100', () => {
    // The fill div should not exceed 100% width
    const { container } = render(<Progress value={150} animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('clamps value below 0 to 0', () => {
    const { container } = render(<Progress value={-20} animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('sets correct percentage width for normal value', () => {
    const { container } = render(<Progress value={75} animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    expect(fill.style.width).toBe('75%')
  })

  it('renders 0% fill for zero value', () => {
    const { container } = render(<Progress value={0} animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('uses custom color when provided', () => {
    const { container } = render(<Progress value={60} color="#ff0000" animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    expect(fill.style.background).toBe('rgb(255, 0, 0)')
  })

  it('applies custom height', () => {
    const { container } = render(<Progress value={50} height={12} animated={false} />)
    const track = container.firstChild as HTMLElement
    expect(track.style.height).toBe('12px')
  })

  it('renders danger variant (non-animated)', () => {
    const { container } = render(<Progress value={110} variant="danger" animated={false} />)
    const fill = container.querySelector('.h-full.rounded-full') as HTMLElement
    // Clamped at 100, danger color applied
    expect(fill.style.width).toBe('100%')
    expect(fill.style.background).toBeTruthy()
  })
})

// ── ProgressWithLabel ─────────────────────────────────────────────────────────

describe('ProgressWithLabel', () => {
  it('shows label when provided', () => {
    render(<ProgressWithLabel value={50} label="Budget" />)
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it('shows valueLabel when provided', () => {
    render(<ProgressWithLabel value={50} valueLabel="€500 / €1000" />)
    expect(screen.getByText('€500 / €1000')).toBeInTheDocument()
  })

  it('shows both label and valueLabel', () => {
    render(<ProgressWithLabel value={50} label="Saved" valueLabel="50%" />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('renders without labels', () => {
    const { container } = render(<ProgressWithLabel value={25} />)
    expect(container.firstChild).toBeInTheDocument()
  })
})
