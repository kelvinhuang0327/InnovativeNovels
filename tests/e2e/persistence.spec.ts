import { test, expect } from '@playwright/test'

test.describe('Persistence & Preferences Journeys', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('Journey 5 & 9 — Reading Progress Persistence survives reload', async ({ page }) => {
    await page.goto('/')
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    
    // Open chapter
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()
    const chapterTitle = await page.getByRole('heading', { level: 1 }).textContent()

    // Reload page
    await page.reload()

    // Assert returned to book detail or active session showing reading progress / continue reading
    // Verify user can continue reading or is restored to the active chapter
    const currentHeading = await page.getByRole('heading', { level: 1 }).textContent()
    if (currentHeading === chapterTitle) {
      // Direct session restoration
      await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
    } else {
      // Returned to book detail or catalog with continue reading button
      const continueButton = page.getByRole('button', { name: new RegExp(`繼續閱讀|${chapterTitle}`) })
      await expect(continueButton.first()).toBeVisible()
    }
  })

  test('Journey 6 — Bookmark state persists across reloads and can be removed', async ({ page }) => {
    await page.goto('/')
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()

    // Add bookmark
    const addBookmarkBtn = page.getByRole('button', { name: '加入章節書籤' })
    await addBookmarkBtn.click()

    // Verify button state changes to active
    await expect(page.getByRole('button', { name: '移除章節書籤' })).toBeVisible()

    // Reload page
    await page.reload()

    // Verify bookmark state persists after reload
    await expect(page.getByRole('button', { name: '移除章節書籤' })).toBeVisible()

    // Remove bookmark
    await page.getByRole('button', { name: '移除章節書籤' }).click()

    // Verify bookmark removed state
    await expect(page.getByRole('button', { name: '加入章節書籤' })).toBeVisible()
  })

  test('Journey 7 — Reader Preferences update UI and persist across reloads', async ({ page }) => {
    await page.goto('/')
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()

    const readerContainer = page.getByRole('region', { name: '閱讀器' })

    await page.getByRole('button', { name: '閱讀設定', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '閱讀設定' })).toBeVisible()

    // Change theme to Sepia / 護眼
    const sepiaThemeOption = page.getByRole('radio', { name: '護眼' })
    await sepiaThemeOption.click()
    await expect(readerContainer).toHaveAttribute('data-theme', 'sepia')

    // Change Font Scale to Large / 大
    const fontLargeOption = page.getByRole('radio', { name: '大', exact: true })
    await fontLargeOption.click()
    await expect(readerContainer).toHaveAttribute('data-font-scale', 'large')
    await page.getByRole('button', { name: '關閉閱讀設定' }).click()

    // Reload page
    await page.reload()

    // Assert persistence after reload
    await expect(readerContainer).toHaveAttribute('data-theme', 'sepia')
    await expect(readerContainer).toHaveAttribute('data-font-scale', 'large')
  })
})
