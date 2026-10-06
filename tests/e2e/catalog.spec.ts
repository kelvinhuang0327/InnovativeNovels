import { test, expect } from '@playwright/test'

test.describe('Journey 2 — Catalog to Book Detail', () => {
  test('navigates from catalog to selected book detail screen', async ({ page }) => {
    await page.goto('/')
    
    // Locate the first book card and get its title
    const firstBookCard = page.locator('article.book-card').first()
    const bookTitle = await firstBookCard.getByRole('heading', { level: 3 }).textContent()
    expect(bookTitle).toBeTruthy()

    // Click "查看書籍" on the first book card
    await firstBookCard.getByRole('button', { name: '查看書籍' }).click()

    // Verify book detail heading matches selected book title
    await expect(page.getByRole('heading', { level: 1, name: bookTitle! })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '章節目錄' })).toBeVisible()
    await expect(page.getByRole('button', { name: '返回書庫' })).toBeVisible()
  })
})
