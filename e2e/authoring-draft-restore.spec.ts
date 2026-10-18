import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { createEmptyAuthoringSession } from '../src/application/authoring/authoringSessionDefaults'
import { exportDraftJson } from '../src/application/authoring/draftExport'
import { evaluateDraftQuality } from '../src/domain/authoring/qualityEvaluator'
import { serializeAuthoringSession } from '../src/infrastructure/persistence/localStorageAuthoringSessionRepository'

const storageKey = 'innovative-novels:authoring-projects:v1'
const titleA = '合成草稿 A'
const titleB = `合成草稿 B ${'LongUnbrokenTitle'.repeat(5)} <script>window.__draftExecuted=true</script>`

function session(title: string) {
  const generated = {
    title, categoryLabel: '合成測試',
    chapters: [1, 2].map((sequence) => ({
      sequence, title: `合成第 ${sequence} 章`,
      prose: Array.from({ length: 5 }, (_, paragraph) => `合成第 ${sequence} 章第 ${paragraph + 1} 段。`),
      metadata: { summary: '合成觀察', keyEvents: ['合成事件'] },
    })),
  }
  return { ...createEmptyAuthoringSession(),
    storyBible: { characters: [{ name: title, notes: '既有設定' }], worldRules: [], openThreads: [], styleNotes: [] },
    draft: { ...generated, status: 'DRAFT' as const, quality: evaluateDraftQuality(generated) } }
}

async function openAuthoring(page: Page) {
  const store = {
    schemaVersion: 1, activeProjectId: 'synthetic-a',
    projects: [
      { projectId: 'synthetic-a', name: '合成作品 A', session: JSON.parse(serializeAuthoringSession(session(titleA))) },
      { projectId: 'synthetic-b', name: '合成作品 B', session: JSON.parse(serializeAuthoringSession(session(titleB))) },
    ],
  }
  await page.addInitScript(({ store, storageKey }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(store))
  }, { store, storageKey })
  // Only local Web assets are needed; no provider or external service is invoked.
  await page.route(/^https?:\/\//, (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue()
    return route.abort()
  })
  await page.goto('/')
  await page.getByRole('button', { name: '開啟創作預覽' }).click()
  await expect(page.getByLabel('草稿標題')).toHaveValue(titleA)
}

async function rawStore(page: Page) {
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}

async function selectJson(page: Page, raw: string) {
  await page.getByLabel('Import Project file').setInputFiles({ name: 'synthetic-draft.json', mimeType: 'application/json', buffer: Buffer.from(raw) })
}

async function expectProtected(page: Page, before: string | null) {
  expect(await rawStore(page)).toBe(before)
  await expect(page.getByLabel('Current Project')).toHaveValue('synthetic-a')
  await expect(page.getByLabel('草稿標題')).toHaveValue(titleA)
}

test('real Web JSON download restores through preview, cancellation, confirmation and reload', async ({ page }, testInfo) => {
  await openAuthoring(page)
  await page.getByLabel('Current Project').selectOption('synthetic-b')
  const expectedJson = await page.getByRole('textbox', { name: 'Draft JSON Export', exact: true }).inputValue()
  const exportButton = page.getByRole('button', { name: '匯出草稿 JSON' })
  await exportButton.scrollIntoViewIfNeeded()
  const beforeExport = await exportButton.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
    return {
      button: bounds.toJSON(), hitId: hit?.id, hitTag: hit?.tagName,
      unobscured: hit === element || (hit !== null && element.contains(hit)),
      pageWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth,
      visualViewport: visualViewport ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } : null,
    }
  })
  await testInfo.attach('export-button-geometry', { body: JSON.stringify(beforeExport), contentType: 'application/json' })
  expect(beforeExport.pageWidth).toBeLessThanOrEqual(beforeExport.viewportWidth + 1)
  expect(beforeExport.unobscured).toBe(true)
  const downloadEvent = page.waitForEvent('download', { timeout: 8_000 })
  await exportButton.click({ timeout: 8_000 })
  const download = await downloadEvent
  const exportedPath = testInfo.outputPath('synthetic-draft-export.json')
  await download.saveAs(exportedPath)
  const downloaded = await readFile(exportedPath, 'utf8')
  expect(downloaded).toBe(expectedJson)
  expect(downloaded).toBe(exportDraftJson(session(titleB).draft))
  await expect(page.getByRole('button', { name: '匯出草稿 JSON' })).toBeEnabled()
  await page.getByLabel('Current Project').selectOption('synthetic-a')
  const before = await rawStore(page)
  await page.getByLabel('Import Project file').setInputFiles(exportedPath)
  const preview = page.getByRole('region', { name: '草稿 JSON 還原預覽' })
  await expect(preview).toBeVisible()
  await expectProtected(page, before)
  await expect(preview.locator('script')).toHaveCount(0)
  await expect(preview.getByText(titleB, { exact: true })).toBeVisible()
  const geometry = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }))
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  expect(await page.evaluate(() => '__draftExecuted' in window)).toBe(false)
  await testInfo.attach('preview-width', { body: JSON.stringify(geometry), contentType: 'application/json' })
  await preview.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('draft-restore-preview.png') })
  await preview.getByRole('button', { name: '取消匯入' }).click()
  await expect(preview).toHaveCount(0)
  await expectProtected(page, before)
  await page.getByLabel('Import Project file').setInputFiles([])
  await expectProtected(page, before)

  await page.getByLabel('Import Project file').setInputFiles(exportedPath)
  await expect(preview).toBeVisible()
  await preview.getByRole('button', { name: '確認另存新專案' }).click()
  await expect(preview).toHaveCount(0)
  const restored = JSON.parse((await rawStore(page)) ?? '{}')
  expect(restored.projects).toHaveLength(3)
  expect(restored.projects.slice(0, 2)).toEqual(JSON.parse(before!).projects)
  expect(['synthetic-a', 'synthetic-b']).not.toContain(restored.activeProjectId)
  expect(restored.projects[2].projectId).toBe(restored.activeProjectId)
  expect(restored.projects[2].session.targetPublishedBookId).toBeUndefined()
  await expect(page.getByLabel('草稿標題')).toHaveValue(titleB)
  await expect(page.getByRole('textbox', { name: 'Draft JSON Export', exact: true })).toHaveValue(downloaded)
  await page.reload()
  await page.getByRole('button', { name: '開啟創作預覽' }).click()
  await expect(page.getByLabel('Current Project')).toHaveValue(restored.activeProjectId)
  await expect(page.getByRole('textbox', { name: 'Draft JSON Export', exact: true })).toHaveValue(downloaded)
  expect(JSON.parse((await rawStore(page)) ?? '{}').projects).toEqual(restored.projects)
})

test('bad JSON and quota denial preserve existing work; an explicit retry creates only one new project', async ({ page }, testInfo) => {
  await openAuthoring(page)
  const before = await rawStore(page)
  const goodJson = exportDraftJson(session(titleB).draft)
  const invalidFiles = [
    { raw: '{', message: 'The selected file is not valid JSON.' },
    { raw: goodJson.replace('"title":', '"title":"duplicate", "title":'), message: 'JSON 含重複欄位' },
    { raw: JSON.stringify({ ...JSON.parse(goodJson), bookId: 'not-allowed' }), message: '不支援欄位' },
  ]
  for (const input of invalidFiles) {
    await selectJson(page, input.raw)
    await expect(page.getByRole('alert')).toContainText(input.message)
    await expect(page.getByRole('region', { name: '草稿 JSON 還原預覽' })).toHaveCount(0)
    await expectProtected(page, before)
  }
  await selectJson(page, goodJson)
  const preview = page.getByRole('region', { name: '草稿 JSON 還原預覽' })
  await expect(preview).toBeVisible()
  await page.evaluate((key) => {
    const original = Storage.prototype.setItem
    const control = window as unknown as { __restoreStorage?: () => void }
    control.__restoreStorage = () => { Storage.prototype.setItem = original }
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Synthetic quota denial', 'QuotaExceededError')
      return original.call(this, name, value)
    }
  }, storageKey)
  await preview.getByRole('button', { name: '確認另存新專案' }).click()
  await expect(page.getByRole('alert')).toContainText('原有作品保留')
  await expect(preview).toBeVisible()
  await expectProtected(page, before)
  await page.getByRole('alert').scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('draft-restore-quota-error.png') })
  // Remove only this test's injected denial; no OS or native restriction is changed.
  await page.evaluate(() => (window as unknown as { __restoreStorage: () => void }).__restoreStorage())
  await preview.getByRole('button', { name: '確認另存新專案' }).click()
  await expect(preview).toHaveCount(0)
  const restored = JSON.parse((await rawStore(page)) ?? '{}')
  expect(restored.projects).toHaveLength(3)
  expect(restored.projects.slice(0, 2)).toEqual(JSON.parse(before!).projects)
  await expect(page.getByRole('textbox', { name: 'Draft JSON Export', exact: true })).toHaveValue(goodJson)
})
