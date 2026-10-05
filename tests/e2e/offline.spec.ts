import { test, expect } from '@playwright/test'

test.describe('Journey 8 — Offline / PWA Service Worker', () => {
  test('Chromium offline PWA caching allows viewing cached reader content offline', async ({ page, context }) => {

    // Service Worker testing requires full registration & caching cycle
    await page.goto('/')

    // Wait for PWA service worker registration & cache readiness
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload()
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

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
