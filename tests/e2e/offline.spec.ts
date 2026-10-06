import { test, expect } from '@playwright/test'
import { startProductionOrigin } from './support/productionOrigin'

test.describe('Journey 8 — Offline / PWA Service Worker', () => {
  test('cached reader reloads from its service worker while its origin is unavailable', async ({ page, context, browserName }) => {
    const origin = await startProductionOrigin()
    try {
      await page.goto(origin.url)
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
      await page.reload()
      await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

      await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
      await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()
      await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
      const chapterTitle = await page.getByRole('heading', { level: 1 }).textContent()
      const previousDocument = await page.evaluate(() => performance.timeOrigin)

      // This removes the actual network source for every engine, without mocking responses.
      await origin.stop()
      await expect(fetch(origin.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow()
      // Pinned WebKit1.63 rejects service-worker navigation under setOffline (upstream #42775).
      // Its gate is origin unavailability; Chromium additionally tests offline emulation.
      if (browserName === 'chromium') {
        await context.setOffline(true)
        expect(await page.evaluate(() => navigator.onLine)).toBe(false)
      }
      const response = await page.reload()
      expect(response?.status()).toBe(200)
      expect(response?.fromServiceWorker()).toBe(true)
      await expect.poll(() => page.evaluate(() => performance.timeOrigin)).not.toBe(previousDocument)
      await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(chapterTitle!)
      await expect(page.getByTestId('chapter-prose').first()).toBeVisible()
    } finally {
      await context.setOffline(false)
      await origin.stop()
    }
  })
})
