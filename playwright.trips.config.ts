import { defineConfig } from '@playwright/test'

// Synthetic local preview only. No original profiles, passwords or live backend.
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'trips.spec.ts', fullyParallel: false, workers: 1,
  reporter: 'line', timeout: 45_000,
  use: { baseURL: 'http://127.0.0.1:3215', contextOptions: { reducedMotion: 'reduce', serviceWorkers: 'block' }, screenshot: 'only-on-failure' },
  projects: [360, 390, 430].map(width => ({ name: `trips-${width}`, use: { viewport: { width, height: 900 } } })),
  webServer: { command: 'npm run dev -- --hostname 127.0.0.1 --port 3215', url: 'http://127.0.0.1:3215/dev-preview/trips', reuseExistingServer: false, timeout: 120_000 },
})
