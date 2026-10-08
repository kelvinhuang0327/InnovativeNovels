import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'authoring-export-feedback.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_FILE ?? './test-results/native-export-20261007/browser-export-feedback-20261008/browser-report.json' }],
  ],
  outputDir: './test-results/native-export-20261007/browser-export-feedback-20261008/results',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: 'http://127.0.0.1:4183',
    browserName: 'chromium',
    channel: 'chrome',
    launchOptions: { chromiumSandbox: true },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: '/opt/homebrew/Cellar/node/24.9.0/bin/node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'narrow-chromium', use: { viewport: { width: 320, height: 720 }, isMobile: true, hasTouch: true } },
    { name: 'desktop-chromium', use: { viewport: { width: 1280, height: 900 } } },
  ],
})
