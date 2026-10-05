import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

interface TideCityFixture {
  chapters: Array<{
    chapterId: string
    access: string
    prose?: string[]
  }>
}

const tideCityFixture = JSON.parse(
  readFileSync(
    new URL('../src/infrastructure/content/books/book-tide-city.json', import.meta.url),
    'utf8',
  ),
) as TideCityFixture

test('finds a book, searches, saves a note, and restores the exact reader passage after reload', async ({
  page,
}, testInfo) => {
  await page.goto('/')
  await page.getByLabel('搜尋小說').fill('潮汐之城')
  await page.getByRole('button', { name: '查看書籍', exact: true }).click()

  await expect(page.getByRole('heading', { name: '潮汐之城' })).toBeVisible()
  await page.getByRole('button', { name: '開始閱讀' }).click()
  await expect(
    page.getByRole('heading', { name: '第一章：潮聲來信' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '本章筆記' }).click()
  const firstNote = page.getByLabel('筆記內容')
  await firstNote.fill('第一章筆記：潮聲來信。')
  await page.getByRole('button', { name: '儲存筆記' }).click()

  await page.getByRole('button', { name: '搜尋本書內文' }).click()
  await page.getByLabel('搜尋關鍵字').fill('回聲灣')
  const searchedChapter = page.getByRole('button', {
    name: /第 5 章・第五章：檔案裡的空頁/,
  }).first()
  await expect(searchedChapter).toBeVisible()
  await searchedChapter.click()

  await expect(
    page.getByRole('heading', { name: '第五章：檔案裡的空頁' }),
  ).toBeVisible()
  await expect(page.getByText(/回聲灣/).first()).toBeVisible()

  await page.getByRole('button', { name: '本章筆記' }).click()
  await page.getByLabel('筆記內容').fill('Playwright 續讀驗收筆記。')
  await page.getByRole('button', { name: '儲存筆記' }).click()

  const passage = page.getByTestId('chapter-prose').nth(5)
  await passage.scrollIntoViewIfNeeded()
  await expect(passage).toBeInViewport()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const progress = page.getByRole('progressbar', { name: '本章閱讀進度' })
  await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')))
    .toBeGreaterThan(0)
  const progressBeforeReload = Number(await progress.getAttribute('aria-valuenow'))

  await page.reload()

  await expect(
    page.getByRole('heading', { name: '第五章：檔案裡的空頁' }),
  ).toBeVisible()
  await expect(
    page.getByRole('status').filter({
      hasText: '已恢復上次閱讀：第五章：檔案裡的空頁',
    }),
  ).toBeVisible()
  await expect(page.getByTestId('chapter-prose').nth(5)).toBeInViewport()
  const progressAfterReload = Number(
    await page
      .getByRole('progressbar', { name: '本章閱讀進度' })
      .getAttribute('aria-valuenow'),
  )
  expect(Math.abs(progressAfterReload - progressBeforeReload)).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: '本章筆記' }).click()
  await expect(page.getByLabel('筆記內容')).toHaveValue(
    'Playwright 續讀驗收筆記。',
  )
  await page.screenshot({
    path: testInfo.outputPath('reader-resume.png'),
  })
})

test('keeps a locked chapter out of the reader and cross-chapter search', async ({
  page,
}) => {
  let lockedParagraph = ''
  let fixtureWasInjected = false

  await page.route('**/book-tide-city.json**', async (route) => {
    const fixture = JSON.parse(JSON.stringify(tideCityFixture)) as TideCityFixture
    const lockedChapter = fixture.chapters.find(
      (chapter) => chapter.chapterId === 'chapter-sealed-gate',
    )

    if (!lockedChapter?.prose?.length) {
      throw new Error('Expected the real tide-city chapter fixture to include prose.')
    }

    lockedParagraph = lockedChapter.prose[0]
    lockedChapter.access = 'LOCKED'
    delete lockedChapter.prose
    fixtureWasInjected = true

    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: `export default ${JSON.stringify(fixture)};`,
    })
  })

  await page.goto('/')
  await expect.poll(() => fixtureWasInjected).toBe(true)
  await page.getByLabel('搜尋小說').fill('潮汐之城')
  await page.getByRole('button', { name: '查看書籍', exact: true }).click()

  const lockedChapterRow = page
    .locator('[data-access="LOCKED"]')
    .filter({ hasText: '第三章：封印之門' })
  await expect(lockedChapterRow).toContainText('已鎖定')
  await expect(
    lockedChapterRow.getByRole('button', { name: /封印之門/ }),
  ).toHaveCount(0)

  await page.getByRole('button', { name: '開始閱讀' }).click()
  await page.getByRole('button', { name: '開啟章節目錄' }).click()
  const lockedTocEntry = page.getByRole('button', { name: /第三章：封印之門/ })
  await expect(lockedTocEntry).toBeDisabled()
  await expect(page.getByText(lockedParagraph, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '關閉章節目錄' }).click()

  await page.getByRole('button', { name: '搜尋本書內文' }).click()
  await page.getByLabel('搜尋關鍵字').fill('三道回答她的光')
  await expect(
    page.getByRole('status').filter({ hasText: '找不到符合' }),
  ).toBeVisible()
  await expect(page.getByText(lockedParagraph, { exact: true })).toHaveCount(0)
})

test('warns when local storage is blocked and keeps the reader usable at 390px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Playwright storage-failure fixture')
      },
    })
  })

  await page.goto('/')
  const storageWarning = page.getByRole('status').filter({
    hasText: '瀏覽器永久儲存目前不可用',
  })
  await expect(storageWarning).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)

  await page.getByLabel('搜尋小說').fill('潮汐之城')
  await page.getByRole('button', { name: '查看書籍', exact: true }).click()
  await expect(page.getByRole('heading', { name: '潮汐之城' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)
  await page.getByRole('button', { name: '開始閱讀' }).click()

  const reader = page.getByRole('region', { name: '閱讀器' })
  await expect(reader).toBeVisible()
  await expect(reader).toHaveAttribute('data-reader-layout', 'mobile')
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390)

  await page.getByRole('button', { name: '本章筆記' }).click()
  await expect(page.getByRole('dialog', { name: '本章筆記' })).toBeVisible()
  await expect(
    page.getByText(/本章筆記只暫存在目前分頁/, { exact: false }),
  ).toBeVisible()
  await page.screenshot({
    path: testInfo.outputPath('reader-mobile-storage.png'),
  })
})
