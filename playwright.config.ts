import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.PLAYWRIGHT_PORT ? Number(process.env.PLAYWRIGHT_PORT) : 3100
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE_URL).hostname)) {
  throw new Error('Default Playwright tests require a loopback URL. Live QA is quarantined.')
}

export default defineConfig({
  testDir: './tests/e2e',
  // This legacy spec uses authenticated browser profiles and mutates live data.
  // Do not load it through the default CLI, npm scripts, or UI runner.
  testIgnore: ['**/sync-verification.spec.ts', '**/*.live.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Disable animations so Framer Motion elements are immediately stable for clicks
    reducedMotion: 'reduce',
  },
  projects: [
    {
      name: 'mobile-small',
      use: {
        ...devices['iPhone SE'],
        viewport: { width: 320, height: 568 },
      },
    },
    {
      name: 'mobile-large',
      use: {
        ...devices['iPhone 14'],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'mobile-xl',
      use: {
        viewport: { width: 453, height: 926 },
        userAgent: devices['iPhone 14 Plus'].userAgent,
      },
    },
    {
      name: 'desktop',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  // Playwright starts and owns the dev server on a dedicated port (3100 by default).
  // This avoids conflicts with manually-run servers on port 3000 and ensures tests
  // always run against a fresh, known-good build of the current branch.
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
