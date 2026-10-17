# SeMa Testing Guide

## Tools installed

| Tool | Purpose |
|---|---|
| **Vitest 1.x** | Fast unit and component test runner (Vite-native) |
| **@testing-library/react** | React component testing utilities |
| **@testing-library/jest-dom** | DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …) |
| **@testing-library/user-event** | Realistic user interaction simulation |
| **jsdom** | Browser DOM environment for Vitest |
| **jest-axe** | Automated accessibility checks via axe-core |
| **@playwright/test** | End-to-end browser automation |

## Available commands

```bash
# Type-check all TypeScript
npm run typecheck

# ESLint
npm run lint

# Run all unit/component tests once
npm run test

# Run tests in watch mode (re-runs on file change)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
# Coverage output: coverage/html/index.html

# End-to-end tests (requires npm run dev running first)
npm run test:e2e

# Playwright UI mode (visual test runner)
npm run test:e2e:ui

# Run all safe automated checks in sequence (CI equivalent)
npm run quality
```

## How tests are organised

```
src/__tests__/
  setup.ts                        # Global test setup (mocks, polyfills)
  lib/
    utils.test.ts                  # Pure utility functions
    greeting.test.ts               # Greeting library
    livingMoment.test.ts           # Living Moment selection logic
    briefing.test.ts               # Briefing item generation
    logger.test.ts                 # Logger utility
  components/ui/
    Button.test.tsx                # Button variants
    Input.test.tsx                 # Input components
    C2Sheet.test.tsx               # Bottom-sheet system
    C2Dialog.test.tsx              # Dialog + DeleteConfirmSheet
    C2Toast.test.tsx               # Toast region, inline error, error state
    EmptyState.test.tsx            # Empty / dashed empty state
    Progress.test.tsx              # Progress bar
    Badge.test.tsx                 # Badge component
    accessibility.test.tsx         # axe-core accessibility checks

tests/
  e2e/
    smoke.spec.ts                  # Playwright smoke tests
  fixtures/
    testState.ts                   # E2E test state helpers
```

## How to write a unit test

Unit tests target **pure functions** in `src/lib/`.
They do not mount React components or require a DOM.

```ts
// src/__tests__/lib/myUtil.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '@/lib/myUtil'

describe('myFunction', () => {
  it('returns the expected value for normal input', () => {
    expect(myFunction('hello')).toBe('HELLO')
  })

  it('handles empty string', () => {
    expect(myFunction('')).toBe('')
  })
})
```

**Coverage checklist for unit tests:**
- Normal case
- Empty / zero input
- Optional fields missing
- Boundary values (first/last of month, 0%, 100%, negative)
- Duplicate data where relevant

## How to write a component test

Component tests use React Testing Library to render real components
in a jsdom environment.

```tsx
// src/__tests__/components/ui/MyComponent.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyComponent } from '@/components/ui/MyComponent'

describe('MyComponent', () => {
  it('renders the title', () => {
    render(<MyComponent title="Hello" />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('calls onAction when button is clicked', async () => {
    const user = userEvent.setup()
    const onAction = vi.fn()
    render(<MyComponent title="Test" onAction={onAction} />)
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    expect(onAction).toHaveBeenCalledOnce()
  })
})
```

**Rules for component tests:**
- Query by role first (`getByRole`), then by text, then by test-id
- Never query by CSS class
- Use `userEvent` not `fireEvent` for realistic interactions
- Wrap async state updates in `act()` or `waitFor()`
- Do not assert on Tailwind class names

## Framer Motion in tests

All Framer Motion components are automatically mocked via
`src/__mocks__/framer-motion.tsx`. The mock renders plain HTML elements
so tests are fast and stable.

If a component's behaviour depends on animation completion, use
`waitFor()` to await the outcome rather than waiting for a timer.

## How to write an end-to-end test

E2E tests use Playwright and run against the running dev server.

```bash
# Terminal 1 — start the dev server
npm run dev

# Terminal 2 — run E2E tests
npm run test:e2e
```

```ts
// tests/e2e/myFlow.spec.ts
import { test, expect } from '@playwright/test'

test('user can add an event', async ({ page }) => {
  // Navigate and select user (real app flow — no credentials)
  await page.goto('/')
  await page.click('button:has-text("Mateo")')
  await page.waitForURL('**/together')

  // Open Add sheet
  await page.click('button[aria-label="Add something"]')
  await expect(page.locator('[role="dialog"]').first()).toBeVisible()

  // Fill in form and save
  await page.fill('input[placeholder="Title"]', 'Dentist appointment')
  await page.click('button:has-text("Save")')
  await expect(page.locator('[role="dialog"]')).not.toBeVisible()
})
```

**E2E viewports:**
- `mobile-small`: 320 × 568 (iPhone SE)
- `mobile-large`: 390 × 844 (iPhone 14)
- `mobile-xl`: 453 × 926
- `desktop`: 1280 × 800

## How to use fixtures

The `tests/fixtures/testState.ts` module provides helpers for setting
up test-safe app state. It does NOT use real credentials or connect to
production Supabase.

The simplest fixture: navigate to `/` and click the user button.
This goes through the real app flow with no mock data needed.

## How to avoid production data

- Never import or use Supabase client in test files
- Never hardcode real email addresses, user IDs, or auth tokens
- Use the landing-page user selection flow for E2E auth
- The Supabase client is globally mocked in `src/__tests__/setup.ts`

## How to investigate a failing test

1. **Read the error message carefully** — RTL errors show the rendered DOM
2. **Run in watch mode** — `npm run test:watch` re-runs on save
3. **Use `screen.debug()`** to print the current DOM
4. **Use Playwright UI mode** — `npm run test:e2e:ui` for visual debugging
5. **Check the framer-motion mock** — if a component's UI depends on
   AnimatePresence, the mock may need adjustment
6. **Check async handling** — state updates must be in `act()` or `waitFor()`

## Current test limitations

- **Supabase integration** — all database calls are mocked; tests do not
  verify real sync behaviour
- **Push notifications** — not testable in jsdom/Playwright CI
- **Receipt OCR** — the scan API route calls an LLM; excluded from tests
- **Image uploads** — require a real Supabase storage bucket; mocked
- **Framer Motion animations** — replaced with static elements in tests;
  animation duration/easing is not tested
- **Accessibility** — automated axe checks detect structural problems but
  do NOT replace manual testing with VoiceOver, NVDA, or keyboard-only
  navigation by real users
- **E2E in CI** — Playwright E2E tests require a running dev server with
  valid Supabase env vars; see the commented job in `.github/workflows/quality.yml`
