import { describe, expect, it } from 'vitest'
import { exportDraftJson } from './draftExport'
import { prepareDraftFileRestore } from './draftFileRestore'
import { MAX_PORTABLE_PROJECT_FILE_BYTES } from './portableProjectFilePort'

const draft = { title: '合成作品', categoryLabel: '合成', chapters: [
  { sequence: 1, title: '合成章節', prose: ['甲', '乙', '丙', '丁', '戊'], metadata: { summary: '合成觀察' } },
] }

describe('Draft file restore preparation', () => {
  it('accepts the existing export format, retaining paragraphs and chapter observations', () => {
    const result = prepareDraftFileRestore(exportDraftJson(draft))
    expect(result.kind).toBe('draft')
    if (result.kind === 'draft') expect(exportDraftJson(result.draft)).toBe(exportDraftJson(draft))
  })

  it.each([
    '{not-json',
    '{"title":"first","title":"second","genre":"合成","chapters":[]}',
    '{"title":"first","\\u0074itle":"second","genre":"合成","chapters":[]}',
    JSON.stringify({ ...JSON.parse(exportDraftJson(draft)), published: true }),
    JSON.stringify({ ...JSON.parse(exportDraftJson(draft)), chapters: [{ sequence: 1, title: '章', prose: '正文', executable: 'alert(1)' }] }),
  ])('rejects malformed, duplicate and unsupported control fields', (raw) => {
    expect(prepareDraftFileRestore(raw).kind).toBe('error')
  })

  it('retains the strict portable-project path instead of coercing mixed envelopes into drafts', () => {
    expect(prepareDraftFileRestore(JSON.stringify({ format: 'invalid-format', title: '合成', genre: '合成', chapters: [] }))).toEqual({ kind: 'portable' })
  })

  it('uses the existing byte limit rather than JavaScript string length', () => {
    const raw = '甲'.repeat(Math.floor(MAX_PORTABLE_PROJECT_FILE_BYTES / 3) + 1)
    expect(raw.length).toBeLessThan(MAX_PORTABLE_PROJECT_FILE_BYTES)
    expect(prepareDraftFileRestore(raw)).toMatchObject({ kind: 'error', message: expect.stringContaining('15 MB') })
  })
})
