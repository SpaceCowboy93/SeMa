/**
 * Component tests for src/components/ui/Badge.tsx
 *
 * Tests: variants, sizes, custom colors, children
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Badge } from '@/components/ui/Badge'

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>PAID</Badge>)
    expect(screen.getByText('PAID')).toBeInTheDocument()
  })

  it('renders success variant without throwing', () => {
    render(<Badge variant="success">Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders warning variant', () => {
    render(<Badge variant="warning">DUE SOON</Badge>)
    expect(screen.getByText('DUE SOON')).toBeInTheDocument()
  })

  it('renders danger variant', () => {
    render(<Badge variant="danger">OVER</Badge>)
    expect(screen.getByText('OVER')).toBeInTheDocument()
  })

  it('renders neutral variant (default)', () => {
    render(<Badge>DRAFT</Badge>)
    expect(screen.getByText('DRAFT')).toBeInTheDocument()
  })

  it('renders info variant', () => {
    render(<Badge variant="info">INFO</Badge>)
    expect(screen.getByText('INFO')).toBeInTheDocument()
  })

  it('renders md size', () => {
    render(<Badge size="md">Label</Badge>)
    const el = screen.getByText('Label')
    expect(el.className).toContain('text-xs')
  })

  it('renders sm size (default)', () => {
    render(<Badge>Small</Badge>)
    const el = screen.getByText('Small')
    expect(el.className).toContain('text-[9px]')
  })

  it('applies custom color via inline style', () => {
    render(<Badge color="#ff0000">RED</Badge>)
    const el = screen.getByText('RED')
    expect(el.style.color).toBe('rgb(255, 0, 0)')
  })

  it('applies custom background via inline style', () => {
    render(<Badge background="#00ff00">GREEN</Badge>)
    const el = screen.getByText('GREEN')
    expect(el.style.background).toBe('rgb(0, 255, 0)')
  })

  it('renders as a span element', () => {
    render(<Badge>Tag</Badge>)
    const el = screen.getByText('Tag')
    expect(el.tagName.toLowerCase()).toBe('span')
  })
})
