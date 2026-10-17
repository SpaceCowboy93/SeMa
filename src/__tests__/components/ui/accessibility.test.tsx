/**
 * Accessibility tests for shared C2 components.
 *
 * Uses jest-axe (compatible with vitest) to detect WCAG violations
 * in rendered components.
 *
 * NOTE: axe automated checks are a supplement to, NOT a replacement for,
 * manual accessibility testing with real screen readers and keyboards.
 */

import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { axe, toHaveNoViolations } from 'jest-axe'
import { expect as vitestExpect } from 'vitest'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { EmptyState } from '@/components/ui/EmptyState'
import { C2ErrorState } from '@/components/ui/C2Toast'
import { C2InlineError } from '@/components/ui/C2Toast'
import { PrimaryButton, SecondaryButton, IconButton } from '@/components/ui/Button'
import { TextInput, SelectInput } from '@/components/ui/Input'
import { C2FormField } from '@/components/ui/C2Sheet'
import { Heart, X } from '@/design/iconSystem'

// Extend vitest's expect with axe matcher
vitestExpect.extend(toHaveNoViolations)

async function a11y(ui: React.ReactElement) {
  const { container } = render(ui)
  let results: Awaited<ReturnType<typeof axe>>
  await act(async () => {
    results = await axe(container)
  })
  return results!
}

// ── Badge ─────────────────────────────────────────────────────────────────────

describe('Badge — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<Badge variant="success">PAID</Badge>)
    vitestExpect(results).toHaveNoViolations()
  })
})

// ── Progress ──────────────────────────────────────────────────────────────────

describe('Progress — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<Progress value={60} animated={false} />)
    vitestExpect(results).toHaveNoViolations()
  })
})

// ── EmptyState ────────────────────────────────────────────────────────────────

describe('EmptyState — accessibility', () => {
  it('has no violations without action', async () => {
    const results = await a11y(
      <EmptyState icon={Heart} title="No items" description="Nothing here yet" animate={false} />,
    )
    vitestExpect(results).toHaveNoViolations()
  })

  it('has no violations with action button', async () => {
    const results = await a11y(
      <EmptyState
        icon={Heart}
        title="No items"
        action={{ label: 'Add one', onClick: () => {} }}
        animate={false}
      />,
    )
    vitestExpect(results).toHaveNoViolations()
  })
})

// ── Error state ───────────────────────────────────────────────────────────────

describe('C2ErrorState — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<C2ErrorState title="Error" message="Try again." onRetry={() => {}} />)
    vitestExpect(results).toHaveNoViolations()
  })
})

describe('C2InlineError — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<C2InlineError message="This field is required" />)
    vitestExpect(results).toHaveNoViolations()
  })
})

// ── Buttons ───────────────────────────────────────────────────────────────────

describe('PrimaryButton — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<PrimaryButton>Save changes</PrimaryButton>)
    vitestExpect(results).toHaveNoViolations()
  })
})

describe('SecondaryButton — accessibility', () => {
  it('has no violations', async () => {
    const results = await a11y(<SecondaryButton>Cancel</SecondaryButton>)
    vitestExpect(results).toHaveNoViolations()
  })
})

describe('IconButton — accessibility', () => {
  it('has no violations when aria-label is provided', async () => {
    const results = await a11y(<IconButton icon={X} aria-label="Close" />)
    vitestExpect(results).toHaveNoViolations()
  })
})

// ── Inputs ────────────────────────────────────────────────────────────────────

describe('C2FormField + TextInput — accessibility', () => {
  it('has no violations with label associated to input', async () => {
    const results = await a11y(
      <C2FormField label="Full name" htmlFor="fname">
        <TextInput id="fname" />
      </C2FormField>,
    )
    vitestExpect(results).toHaveNoViolations()
  })

  it('has no violations with error message', async () => {
    const results = await a11y(
      <C2FormField label="Email" htmlFor="email" error="Enter a valid email">
        <TextInput id="email" type="email" error="Enter a valid email" />
      </C2FormField>,
    )
    vitestExpect(results).toHaveNoViolations()
  })
})

describe('SelectInput — accessibility', () => {
  it('has no violations when wrapped in a label', async () => {
    const results = await a11y(
      <label>
        Category
        <SelectInput>
          <option value="a">Option A</option>
        </SelectInput>
      </label>,
    )
    vitestExpect(results).toHaveNoViolations()
  })
})
