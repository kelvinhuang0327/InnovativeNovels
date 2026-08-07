import { test, expect } from '@playwright/test'

test.describe('Reader Journeys', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test for clean baseline state
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('Journey 3 — Open Reader displays chapter content', async ({ page }) => {
    await page.goto('/')
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    
    // Click Start Reading / Read Chapter button
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()

    // Assert Reader screen loaded with chapter heading and prose content
    await expect(page.getByRole('region', { name: '閱讀器' })).toBeVisible()
    await expect(page.getByRole('article', { name: '章節內文' })).toBeVisible()
    await expect(page.getByTestId('chapter-prose').first()).toBeVisible()
  })

  test('Journey 4 — Previous / Next Chapter navigation updates chapter title and content', async ({ page }) => {
    await page.goto('/')
    await page.locator('article.book-card').first().getByRole('button', { name: '查看書籍' }).click()
    
    // Open chapter 1
    await page.getByRole('button', { name: /閱讀本章|開始試閱|開始閱讀/ }).first().click()
    const firstChapterTitle = await page.getByRole('heading', { level: 1 }).textContent()

    // Click Next Chapter button
    const nextButton = page.getByRole('button', { name: '下一章' }).first()
    await expect(nextButton).toBeVisible()
    await nextButton.click()

    // Assert chapter title changed
    const secondChapterTitle = await page.getByRole('heading', { level: 1 }).textContent()
    expect(secondChapterTitle).not.toEqual(firstChapterTitle)

    // Click Previous Chapter button
    const prevButton = page.getByRole('button', { name: '上一章' }).first()
    await expect(prevButton).toBeVisible()
    await prevButton.click()

    // Assert returned to first chapter title
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(firstChapterTitle!)
  })
})
