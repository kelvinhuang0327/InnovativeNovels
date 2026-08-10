import { describe, expect, it } from 'vitest'
import { parseAgentDraftExchange } from '../../domain/authoring/agentDraftExchange'
import type { GeneratedDraft } from '../../domain/authoring/authoringContracts'
import { exportDraftJson, mapGeneratedDraftToAgentDraftExchange } from './draftExport'

const draft: GeneratedDraft = {
  title: '潮汐檔案（已編輯）',
  categoryLabel: '科幻懸疑',
  chapters: [
    { sequence: 2, title: '第二章', prose: ['第二段。', '第三段。'] },
    { sequence: 8, title: '第一章', prose: ['第一段。'] },
  ],
}

describe('Draft export', () => {
  it('exports only the provider-neutral exchange fields with continuous sequences', () => {
    expect(mapGeneratedDraftToAgentDraftExchange(draft)).toEqual({
      title: '潮汐檔案（已編輯）',
      genre: '科幻懸疑',
      chapters: [
        { sequence: 1, title: '第二章', prose: '第二段。\n\n第三段。' },
        { sequence: 2, title: '第一章', prose: '第一段。' },
      ],
    })
    expect(exportDraftJson(draft)).toBe(
      JSON.stringify(mapGeneratedDraftToAgentDraftExchange(draft), null, 2),
    )
  })

  it('round-trips exchange fields through the existing strict parser', () => {
    const parsed = parseAgentDraftExchange(exportDraftJson(draft))
    expect(parsed).toEqual({
      ok: true,
      exchange: {
        title: '潮汐檔案（已編輯）',
        genre: '科幻懸疑',
        chapters: [
          { sequence: 1, title: '第二章', prose: '第二段。\n\n第三段。' },
          { sequence: 2, title: '第一章', prose: '第一段。' },
        ],
      },
    })
  })
})
