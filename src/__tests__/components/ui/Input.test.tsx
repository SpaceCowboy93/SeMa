/**
 * Component tests for src/components/ui/Input.tsx
 *
 * Tests: TextInput, SelectInput, CurrencyInput, SearchInput
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextInput, SelectInput, CurrencyInput, SearchInput } from '@/components/ui/Input'

// ── TextInput ─────────────────────────────────────────────────────────────────

describe('TextInput', () => {
  it('renders an input element', () => {
    render(<TextInput placeholder="Enter name" />)
    expect(screen.getByPlaceholderText('Enter name')).toBeInTheDocument()
  })

  it('accepts user input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextInput onChange={onChange} />)
    const input = screen.getByRole('textbox')
    await user.type(input, 'Hello')
    expect(onChange).toHaveBeenCalled()
  })

  it('shows error message when error prop is set', () => {
    render(<TextInput error="Name is required" />)
    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })

  it('does not show error paragraph when no error prop', () => {
    render(<TextInput />)
    // No p element with error class
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument()
  })

  it('applies error ring class when error is set', () => {
    render(<TextInput error="Required" />)
    const input = screen.getByRole('textbox')
    expect(input.className).toContain('ring')
  })

  it('forwards ref', () => {
    const ref = vi.fn()
    render(<TextInput ref={ref} />)
    expect(ref).toHaveBeenCalled()
  })
})

// ── SelectInput ───────────────────────────────────────────────────────────────

describe('SelectInput', () => {
  it('renders a select element with children', () => {
    render(
      <SelectInput>
        <option value="a">Option A</option>
        <option value="b">Option B</option>
      </SelectInput>,
    )
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
  })

  it('shows error message when error is provided', () => {
    render(
      <SelectInput error="Please select an option">
        <option value="a">A</option>
      </SelectInput>,
    )
    expect(screen.getByText('Please select an option')).toBeInTheDocument()
  })

  it('calls onChange when selection changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <SelectInput onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </SelectInput>,
    )
    await user.selectOptions(screen.getByRole('combobox'), 'b')
    expect(onChange).toHaveBeenCalled()
  })
})

// ── CurrencyInput ─────────────────────────────────────────────────────────────

describe('CurrencyInput', () => {
  it('renders the currency symbol', () => {
    render(<CurrencyInput />)
    expect(screen.getByText('€')).toBeInTheDocument()
  })

  it('renders a custom currency symbol', () => {
    render(<CurrencyInput symbol="$" />)
    expect(screen.getByText('$')).toBeInTheDocument()
  })

  it('shows error when provided', () => {
    render(<CurrencyInput error="Amount required" />)
    expect(screen.getByText('Amount required')).toBeInTheDocument()
  })

  it('accepts numeric input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CurrencyInput onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    await user.type(input, '42')
    expect(onChange).toHaveBeenCalled()
  })
})

// ── SearchInput ───────────────────────────────────────────────────────────────

describe('SearchInput', () => {
  it('renders an input with type search', () => {
    render(<SearchInput />)
    // type="search" renders with role searchbox or textbox depending on browser
    const input = document.querySelector('input[type="search"]')
    expect(input).toBeTruthy()
  })

  it('accepts user input', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SearchInput onChange={onChange} placeholder="Search…" />)
    const input = screen.getByPlaceholderText('Search…')
    await user.type(input, 'apple')
    expect(onChange).toHaveBeenCalled()
  })
})
