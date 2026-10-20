import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

const candidate = '/Users/kelvin/VibeCoding-WorkSpace/InnovativeNovels/.worktrees/InnovativeNovels-batch-continuity-20261006'
const require = createRequire(`${candidate}/package.json`)
const { chromium, expect } = require('@playwright/test')
const browser = await chromium.launch({ channel: 'chrome', chromiumSandbox: true })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const fixture = { title: '合成跨章驗收', genre: '懸疑', chapters: [
  { sequence: 1, title: '鐘', prose: '第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段', metadata: { sourceChapterIndex: 0, sourceChapterId: 'synthetic-source', summary: '鐘停止', keyEvents: ['鐘停止'], setups: ['缺角鑰匙'] } },
  { sequence: 2, title: '房間', prose: '第六段\n\n第七段\n\n第八段\n\n第九段\n\n第十段', metadata: { summary: '走進房間' } },
] }
const advisory = page.locator('section[aria-labelledby="batch-continuity-heading"]')
const exportJson = async () => JSON.parse(await page.getByRole('textbox', { name: 'Draft JSON Export', exact: true }).inputValue())
const stored = async () => page.evaluate(() => {
  const projects = JSON.parse(localStorage.getItem('innovative-novels:authoring-projects:v1') ?? 'null')
  return projects?.projects?.find((project) => project.projectId === projects.activeProjectId)?.session
    ?? JSON.parse(localStorage.getItem('innovative-novels:authoring-session:v1') ?? 'null')
})
try {
  await page.goto('http://127.0.0.1:4175')
  await page.getByRole('button', { name: '開啟創作預覽', exact: true }).click()
  await page.getByLabel('Raw Agent JSON', { exact: true }).fill(JSON.stringify(fixture))
  await page.getByRole('button', { name: 'Import Structured Draft', exact: true }).click()
  await expect(advisory).toContainText('來源章節：1；檢視章節：2')
  await expect(advisory).toContainText('metadata.keyEvents：鐘停止')
  await expect(advisory).toContainText('metadata.setups：缺角鑰匙')
  await expect(advisory).toContainText('不證明故事正確')
  await advisory.screenshot({ path: '/tmp/novels-batch-continuity-qa-20261006/mobile-warning.png' })
  expect((await exportJson()).chapters[0].metadata.sourceChapterIndex).toBe(0)
  await expect.poll(async () => (await stored())?.draft?.chapters[0]?.metadata?.sourceChapterId).toBe('synthetic-source')
  await page.reload()
  await page.getByRole('button', { name: '開啟創作預覽', exact: true }).click()
  await expect(advisory).toContainText('metadata.keyEvents：鐘停止')
  expect((await exportJson()).chapters[0].metadata.sourceChapterId).toBe('synthetic-source')
  const invalid = { ...fixture, chapters: [{ ...fixture.chapters[0], metadata: { access: 'READABLE' } }] }
  await page.getByLabel('Raw Agent JSON', { exact: true }).fill(JSON.stringify(invalid))
  await page.getByRole('button', { name: 'Import Structured Draft', exact: true }).click()
  await expect(page.getByText('Import validation failed. The previous accepted Draft was preserved.', { exact: true })).toBeVisible()
  expect((await exportJson()).chapters).toHaveLength(2)
  await expect(advisory).toContainText('metadata.keyEvents：鐘停止')
  await page.locator('#chapter-1-prose').fill('合成修改正文。')
  await expect(advisory).toContainText('資料不足')
  expect((await exportJson()).chapters[0]).not.toHaveProperty('metadata')
  await expect.poll(async () => (await stored())?.draft?.chapters[0]?.prose?.[0]).toBe('合成修改正文。')
  await page.reload()
  await page.getByRole('button', { name: '開啟創作預覽', exact: true }).click()
  await expect(advisory).toContainText('資料不足')
  expect((await exportJson()).chapters[0]).not.toHaveProperty('metadata')
  expect(errors).toEqual([])
  await advisory.screenshot({ path: '/tmp/novels-batch-continuity-qa-20261006/mobile-advisory.png' })
  await writeFile('/tmp/novels-batch-continuity-qa-20261006/result.json', JSON.stringify({ passed: true, browser: 'installed Chrome in isolated context', viewport: '390x844', flows: ['import warning provenance', 'export metadata', 'reload metadata persistence', 'reject invalid metadata and preserve draft', 'edit clears metadata', 'reload edited draft'], pageErrors: errors }, null, 2))
  process.stdout.write('Authoring mobile acceptance passed (6 flow assertions; no page errors).\n')
} finally {
  await context.close()
  await browser.close()
}
