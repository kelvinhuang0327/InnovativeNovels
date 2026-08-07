import { test, expect } from '@playwright/test'

test.describe('Journey 8 — Offline / PWA Service Worker', () => {
  test('Chromium offline PWA caching allows viewing cached reader content offline', async ({ page, context, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit offline emulation via Playwright context.setOffline is not supported by WebKit engine')

    // Service Worker testing requires full registration & caching cycle
    await page.goto('/')

    // Wait for PWA service worker registration & cache readiness
    await page.waitForLoadState('networkidle')

    // Navigate into book and chapter to prime service worker runtime caches
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()
    await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()

    // Switch context to offline mode
    await context.setOffline(true)

    // Reload page in offline mode
    await page.reload()

    // Assert cached application and reader content remains visible and usable
    await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
    await expect(page.getByTestId('chapter-prose').first()).toBeVisible()

    // Restore online mode
    await context.setOffline(false)
  })
})
