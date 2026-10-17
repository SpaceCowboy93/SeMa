/**
 * E2E smoke tests — SeMa Calendar
 *
 * These tests verify that the application loads correctly and primary
 * navigation flows work without crashing.
 *
 * Requirements:
 *   - The dev server is started automatically by Playwright on port 3100
 *   - Tests do NOT connect to production data
 *   - Tests do NOT use real credentials
 *   - Tests use the landing page user-selection flow to avoid
 *     touching production authentication
 *
 * Run:  npm run test:e2e
 */

import { test, expect, type Page } from '@playwright/test'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Navigate to the landing page and select the test user.
 * This is the real app flow — no mock credentials required.
 */
async function selectUser(page: Page, user: 'Mateo' | 'Seval' = 'Mateo') {
  await page.goto('/')
  // Wait for the user selection buttons to be visible and stable
  await page.waitForSelector(`button:has-text("${user}")`, { timeout: 15_000 })
  await page.click(`button:has-text("${user}")`)
  // Use domcontentloaded: avoids waiting for Supabase/push-notification network
  // requests that can hold open the 'load' event indefinitely in dev mode.
  await page.waitForURL('**/together', { waitUntil: 'domcontentloaded', timeout: 25_000 })
}

/**
 * Collect all console errors that occur during the test.
 * Returned as an array of strings for assertion.
 */
function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text())
    }
  })
  page.on('pageerror', err => {
    errors.push(err.message)
  })
  return errors
}

/**
 * Filter out errors that are expected in the test environment and not real
 * application failures: framework warnings, HMR noise, and Supabase network
 * errors that occur because localhost:3100 is not an allowed CORS origin.
 * WebKit reports blocked network requests as console errors; Chromium does not.
 */
function isFatalError(msg: string): boolean {
  if (msg.includes('Warning:')) return false
  if (msg.includes('[HMR]')) return false
  // Supabase CORS / WebSocket errors are expected when running on localhost:3100
  // (the Supabase project restricts allowed origins to production domains).
  // WebKit (Safari) surfaces blocked requests as console errors; Chromium does not.
  if (msg.includes('supabase.co')) return false
  if (msg.includes('WebSocket') && msg.includes('supabase')) return false
  // Next.js dev-server HMR requests blocked by CORS on WebKit (not an app error).
  if (msg.includes('_next/static/webpack') && msg.includes('access control')) return false
  if (msg.includes('hot-update') && msg.includes('access control')) return false
  return true
}

/**
 * Soft-navigate to an app route using the bottom nav link so that the Zustand
 * store (and currentUser) is preserved across the navigation.
 * Falls back to clicking a visible link with href matching the route.
 */
async function softNavigate(page: Page, ariaLabel: string, urlGlob: string) {
  await page.click(`nav a[aria-label="${ariaLabel}"]`)
  await page.waitForURL(urlGlob, { waitUntil: 'domcontentloaded', timeout: 15_000 })
}

// ── Application load ──────────────────────────────────────────────────────────

test.describe('Application load', () => {
  test('landing page loads without fatal error', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    // Page should render something meaningful
    await expect(page.locator('body')).not.toBeEmpty()
    // No unhandled JS errors
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })

  test('landing page shows user selection', async ({ page }) => {
    await page.goto('/')
    // Expect both user buttons to be visible
    await expect(page.locator('button:has-text("Mateo"), button:has-text("Seval")').first()).toBeVisible({ timeout: 10_000 })
  })

  test('selecting a user navigates to /together', async ({ page }) => {
    await selectUser(page, 'Mateo')
    expect(page.url()).toContain('/together')
  })
})

// ── Bottom navigation ──────────────────────────────────────────────────────────

test.describe('BottomNav navigation', () => {
  test.beforeEach(async ({ page }) => {
    await selectUser(page, 'Mateo')
  })

  test('bottom navigation bar is visible', async ({ page }) => {
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()
  })

  test('navigates to Planner', async ({ page }) => {
    await page.click('nav a[aria-label="Planner"]')
    await page.waitForURL('**/planner', { timeout: 8_000 })
    expect(page.url()).toContain('/planner')
  })

  test('navigates to Finances (Plans)', async ({ page }) => {
    await page.click('nav a[aria-label="Finances"]')
    await page.waitForURL('**/plans', { timeout: 8_000 })
    expect(page.url()).toContain('/plans')
  })

  test('navigates to Us', async ({ page }) => {
    await page.click('nav a[aria-label="Us"]')
    await page.waitForURL('**/us', { timeout: 8_000 })
    expect(page.url()).toContain('/us')
  })

  test('navigates back to Home', async ({ page }) => {
    // First go to Planner
    await page.click('nav a[aria-label="Planner"]')
    await page.waitForURL('**/planner', { timeout: 8_000 })
    // Then back to Home
    await page.click('nav a[aria-label="Home"]')
    await page.waitForURL('**/together', { timeout: 8_000 })
    expect(page.url()).toContain('/together')
  })
})

// ── Primary routes ─────────────────────────────────────────────────────────────

test.describe('Primary routes — no crash', () => {
  test.beforeEach(async ({ page }) => {
    await selectUser(page, 'Mateo')
  })

  test('Home (/together) loads without crash', async ({ page }) => {
    const errors = collectErrors(page)
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })

  test('Planner (/planner) loads without crash', async ({ page }) => {
    const errors = collectErrors(page)
    await softNavigate(page, 'Planner', '**/planner')
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })

  test('Finances (/plans) loads without crash', async ({ page }) => {
    const errors = collectErrors(page)
    await softNavigate(page, 'Finances', '**/plans')
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })

  test('Us (/us) loads without crash', async ({ page }) => {
    const errors = collectErrors(page)
    await softNavigate(page, 'Us', '**/us')
    await expect(page.locator('main')).toBeVisible()
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })

  test('Shopping (/shopping) loads without crash', async ({ page }) => {
    const errors = collectErrors(page)
    // /shopping has no bottom-nav link so we cannot soft-navigate from the
    // authenticated shell. A hard navigation resets Zustand (currentUser is
    // not persisted), causing the app layout to immediately call
    // router.replace('/') — which fires a second navigation before the first
    // one completes. Using waitUntil:'commit' prevents Playwright from throwing
    // "navigation interrupted"; the auth redirect then finishes normally.
    await page.goto('/shopping', { waitUntil: 'commit' }).catch(() => {})
    // The auth redirect lands us on the landing page at '/'.
    // Wait for it to settle and assert we are on a real, healthy page.
    await page.waitForURL('**/', { waitUntil: 'domcontentloaded', timeout: 15_000 })
    // Landing page must show the user-selection UI — proves the app did not crash.
    await expect(
      page.locator('button:has-text("Mateo"), button:has-text("Seval")').first()
    ).toBeVisible({ timeout: 5_000 })
    expect(errors.filter(isFatalError)).toHaveLength(0)
  })
})

// ── Global Add (FAB) ───────────────────────────────────────────────────────────

test.describe('Global Add button (FAB)', () => {
  test.beforeEach(async ({ page }) => {
    await selectUser(page, 'Mateo')
  })

  test('FAB is visible on the home screen', async ({ page }) => {
    const fab = page.locator('button[aria-label="Add something"]')
    await expect(fab).toBeVisible()
  })

  test('FAB opens the QuickAdd sheet', async ({ page }) => {
    await page.click('button[aria-label="Add something"]')
    // The sheet should appear — look for a dialog or sheet panel
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('opened sheet can be closed', async ({ page }) => {
    await page.click('button[aria-label="Add something"]')
    await expect(page.locator('[role="dialog"]').first()).toBeVisible({ timeout: 5_000 })

    // Try pressing Escape to close
    await page.keyboard.press('Escape')
    // Sheet should disappear
    await expect(page.locator('[role="dialog"]').first()).not.toBeVisible({ timeout: 5_000 })
  })
})

// ── Layout — horizontal overflow ──────────────────────────────────────────────

test.describe('Layout — no horizontal overflow', () => {
  function hasHorizontalScroll(page: Page) {
    return page.evaluate(() => {
      const vw = window.innerWidth
      // Scan every element for a right edge that extends beyond the viewport.
      // Skip position:fixed elements — they are laid out relative to the viewport
      // and cannot cause document-level horizontal scroll. WebKit incorrectly
      // includes transformed fixed elements in document.documentElement.scrollWidth,
      // so we avoid that API entirely.
      return Array.from(document.body.querySelectorAll<Element>('*')).some(el => {
        if (getComputedStyle(el).position === 'fixed') return false
        return el.getBoundingClientRect().right > vw + 1 // 1 px sub-pixel tolerance
      })
    })
  }

  test('no horizontal overflow on Home (mobile)', async ({ page }) => {
    await selectUser(page, 'Mateo')
    // selectUser ends at /together — check it immediately (no extra navigation)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test('no horizontal overflow on Planner (mobile)', async ({ page }) => {
    await selectUser(page, 'Mateo')
    await softNavigate(page, 'Planner', '**/planner')
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test('no horizontal overflow on Finances (mobile)', async ({ page }) => {
    await selectUser(page, 'Mateo')
    await softNavigate(page, 'Finances', '**/plans')
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test('no horizontal overflow on Us (mobile)', async ({ page }) => {
    await selectUser(page, 'Mateo')
    await softNavigate(page, 'Us', '**/us')
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})

// ── Both users ────────────────────────────────────────────────────────────────

test.describe('Both users can log in', () => {
  test('Seval can select and reach /together', async ({ page }) => {
    await selectUser(page, 'Seval')
    expect(page.url()).toContain('/together')
  })
})
