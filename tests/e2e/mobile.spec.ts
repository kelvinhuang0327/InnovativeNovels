import { test, expect } from '@playwright/test'

test.describe('Journey 10 — Mobile Reader Emulation', () => {
  test('catalog, book detail, and reader are fully usable with no horizontal overflow', async ({ page }) => {
    await page.goto('/')

    // Assert main catalog loads on mobile viewport
    await expect(page.getByRole('heading', { level: 1, name: '探索故事' })).toBeVisible()

    // Assert document width does not overflow mobile viewport
    const viewportSize = page.viewportSize()
    if (viewportSize) {
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(scrollWidth).toBeLessThanOrEqual(viewportSize.width + 5)
    }

    // Open book detail
    const bookCard = page.locator('article.book-card').first()
    await bookCard.getByRole('button', { name: '查看書籍' }).click()
    await expect(page.getByRole('heading', { level: 2, name: '章節目錄' })).toBeVisible()

    // Open reader
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()
    await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
    await expect(page.getByTestId('chapter-prose').first()).toBeVisible()

    // Verify touch / navigation controls are visible and reachable
    await expect(page.getByRole('button', { name: '返回作品' })).toBeVisible()
  })
})
