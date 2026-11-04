import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'receipt-scanner.spec.ts', workers: 1,
  reporter: 'list', timeout: 120000,
  use: { baseURL: 'http://localhost:3100', screenshot: 'only-on-failure' },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'], launchOptions: { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined } } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'npm run dev -- --port 3100', url: 'http://localhost:3100', timeout: 120000, reuseExistingServer: false },
})
