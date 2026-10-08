import { expect, test, type Locator, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { createEmptyAuthoringSession } from '../src/application/authoring/authoringSessionDefaults'
import { describeFileExport } from '../src/application/export/textFileExportPort'
import type { GeneratedDraft } from '../src/domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../src/domain/authoring/qualityEvaluator'
import { parseAuthoringSession, serializeAuthoringSession } from '../src/infrastructure/persistence/localStorageAuthoringSessionRepository'

const storageKey = 'innovative-novels:authoring-projects:v1'
const longTitle = '合成長篇草稿與匯出檔名測試'.repeat(8)

function session(title: string) {
  const generated: GeneratedDraft = {
    title,
    categoryLabel: '測試',
    chapters: Array.from({ length: 6 }, (_, chapter) => ({
      sequence: chapter + 1,
      title: `合成第 ${chapter + 1} 章`,
      prose: Array.from({ length: 5 }, (_, paragraph) => `合成章節 ${chapter + 1} 第 ${paragraph + 1} 段。`.repeat(24)),
    })),
  }
  const serialized = serializeAuthoringSession({
    ...createEmptyAuthoringSession(),
    draft: { ...generated, status: 'DRAFT', quality: evaluateDraftQuality(generated) },
  })
  expect(parseAuthoringSession(serialized)).toBeDefined()
  return JSON.parse(serialized)
}

type Mode = 'saved' | 'cancelled' | 'failed' | 'pending'
interface MockControl {
  calls: Array<{ filename: string; content: string; mimeType: string }>
  complete?: () => void
}

async function openAuthoring(page: Page, mode: Mode) {
  const store = {
    schemaVersion: 1,
    activeProjectId: 'synthetic-a',
    projects: [
      { projectId: 'synthetic-a', name: longTitle, session: session(longTitle) },
      { projectId: 'synthetic-b', name: '合成專案 B', session: session('合成草稿 B') },
    ],
  }
  await page.addInitScript(({ store, mode, storageKey }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(store))
    const control: MockControl = { calls: [] }
    const browser = window as unknown as {
      CapacitorCustomPlatform: { name: string }
      Capacitor: object
      __exportFeedbackMock: MockControl
    }
    browser.__exportFeedbackMock = control
    browser.CapacitorCustomPlatform = { name: 'ios' }
    // Browser-only JavaScript bridge: no UIKit, filesystem, or native host is invoked.
    browser.Capacitor = {
      PluginHeaders: [{ name: 'LocalFileExport', methods: [{ name: 'exportFile', rtype: 'promise' }] }],
      nativePromise: (plugin: string, method: string, file: MockControl['calls'][number]) => {
        if (plugin !== 'LocalFileExport' || method !== 'exportFile') throw new Error('Unexpected mock bridge call')
        control.calls.push({ ...file })
        if (mode === 'failed') return Promise.reject(new Error('Synthetic export failure'))
        if (mode === 'cancelled') return Promise.resolve({ status: 'cancelled' })
        if (mode === 'pending') return new Promise((resolve) => {
          control.complete = () => resolve({ status: 'saved', filename: file.filename })
        })
        return Promise.resolve({ status: 'saved', filename: file.filename })
      },
    }
  }, { store, mode, storageKey })
  await page.goto('/')
  await page.getByRole('button', { name: '開啟創作預覽' }).click()
  await expect(page.getByLabel('草稿標題')).toHaveValue(longTitle)
  return page.evaluate((key) => localStorage.getItem(key), storageKey)
}

async function assertUnobscured(page: Page, notice: Locator) {
  await expect(notice).toBeInViewport({ ratio: 1 })
  const geometry = await notice.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const points = [
      [rect.left + 4, rect.top + 4], [rect.right - 4, rect.top + 4],
      [rect.left + 4, rect.bottom - 4], [rect.right - 4, rect.bottom - 4],
    ]
    return {
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: visualViewport?.height ?? innerHeight,
      visualViewportWidth: visualViewport?.width ?? innerWidth,
      scrollY,
      unobscured: points.every(([x, y]) => {
        const top = document.elementFromPoint(x, y)
        return top === element || (top !== null && element.contains(top))
      }),
      pageWidth: document.documentElement.scrollWidth,
    }
  })
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  expect(geometry.visualViewportWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  expect(geometry.unobscured).toBe(true)
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1)
  expect(await page.evaluate(() => Boolean((window as unknown as { webkit?: { messageHandlers?: { bridge?: unknown } } }).webkit?.messageHandlers?.bridge))).toBe(false)
  return geometry
}

for (const target of ['draft', 'project'] as const) {
  for (const mode of ['saved', 'cancelled', 'failed'] as const) {
    test(`${target} ${mode}: one nearby result remains visible with long content`, async ({ page }, testInfo) => {
      const original = await openAuthoring(page, mode)
      const group = page.getByRole('group', { name: target === 'draft' ? '草稿檔案匯出' : '專案檔案匯出' })
      const button = group.getByRole('button', { name: target === 'draft' ? '匯出草稿 JSON' : 'Export Current Project' })
      await button.scrollIntoViewIfNeeded()
      const beforeExport = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          button: rect.toJSON(), hit: hit?.tagName, hitId: hit?.id,
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          innerWidth, innerHeight, scrollX, scrollY,
          visualViewport: visualViewport ? {
            width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale,
            offsetLeft: visualViewport.offsetLeft, offsetTop: visualViewport.offsetTop,
          } : null,
          overflowingElements: Array.from(document.querySelectorAll('*')).flatMap((candidate) => {
            const bounds = candidate.getBoundingClientRect()
            return bounds.right > document.documentElement.clientWidth + 1
              ? [{ tag: candidate.tagName, id: candidate.id, className: candidate.className, width: bounds.width, right: bounds.right }]
              : []
          }).slice(0, 12),
        }
      })
      const beforeGeometryPath = testInfo.outputPath('before-export-geometry.json')
      await writeFile(beforeGeometryPath, JSON.stringify(beforeExport, null, 2))
      await testInfo.attach('before-export-geometry', { path: beforeGeometryPath, contentType: 'application/json' })
      expect(beforeExport.pageWidth).toBeLessThanOrEqual(beforeExport.viewportWidth + 1)
      await button.click({ timeout: 8_000 })
      const notice = group.getByRole(mode === 'failed' ? 'alert' : 'status')
      await expect(notice).toBeVisible()
      const calls = await page.evaluate(() => (window as unknown as { __exportFeedbackMock: MockControl }).__exportFeedbackMock.calls)
      expect(calls).toHaveLength(1)
      const message = mode === 'failed'
        ? '無法匯出檔案，原有資料保留。請重試。'
        : describeFileExport(mode === 'cancelled' ? { status: 'cancelled' } : { status: 'saved', filename: calls[0].filename })
      await expect(notice).toHaveText(message)
      await expect(page.locator('.authoring-file-export-feedback')).toHaveCount(1)
      await expect(button).toHaveAccessibleDescription(message)
      await expect(button).toBeEnabled()
      const geometry = await assertUnobscured(page, notice)
      if (target === 'draft') expect(geometry.scrollY).toBeGreaterThan(1000)
      expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(original)
      const payload = JSON.parse(calls[0].content)
      expect(target === 'draft' ? payload.title : payload.project.session.draft.title).toBe(longTitle)
      const visibleGeometryPath = testInfo.outputPath('visible-result-geometry.json')
      await writeFile(visibleGeometryPath, JSON.stringify(geometry, null, 2))
      await testInfo.attach('visible-result-geometry', { path: visibleGeometryPath, contentType: 'application/json' })
      await page.screenshot({ path: testInfo.outputPath(`${target}-${mode}-visible.png`) })
    })
  }
}

test('a late response stays isolated from the new active project and its content', async ({ page }, testInfo) => {
  const original = JSON.parse((await openAuthoring(page, 'pending')) ?? '{}')
  await page.getByRole('button', { name: 'Export Current Project' }).click()
  await expect(page.getByRole('button', { name: '匯出草稿 JSON' })).toBeDisabled()
  await page.getByLabel('Current Project').selectOption('synthetic-b')
  await expect(page.getByLabel('草稿標題')).toHaveValue('合成草稿 B')
  const beforeCompletion = await page.evaluate(() => scrollY)
  await page.evaluate(() => (window as unknown as { __exportFeedbackMock: MockControl }).__exportFeedbackMock.complete?.())
  await expect(page.getByRole('button', { name: 'Export Current Project' })).toBeEnabled()
  await expect(page.locator('.authoring-file-export-feedback')).toHaveCount(0)
  await expect(page.getByLabel('草稿標題')).toHaveValue('合成草稿 B')
  expect(Math.abs(await page.evaluate(() => scrollY) - beforeCompletion)).toBeLessThanOrEqual(1)
  const after = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), storageKey)) ?? '{}')
  expect(after.activeProjectId).toBe('synthetic-b')
  expect(after.projects).toEqual(original.projects)
  const calls = await page.evaluate(() => (window as unknown as { __exportFeedbackMock: MockControl }).__exportFeedbackMock.calls)
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0].content).project.session.draft.title).toBe(longTitle)
  await page.screenshot({ path: testInfo.outputPath('late-result-isolation.png') })
})
