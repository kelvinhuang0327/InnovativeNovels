import { test, expect } from '@playwright/test'

test.describe('Journey 1 — Application Smoke', () => {
  test('app loads without errors and displays main catalog content', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: '探索故事' })).toBeVisible()
    await expect(page.getByRole('button', { name: '查看書籍' }).first()).toBeVisible()
  })
})
