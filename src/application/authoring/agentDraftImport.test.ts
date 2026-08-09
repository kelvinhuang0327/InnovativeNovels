import { describe, expect, it } from 'vitest'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import {
  importAgentDraft,
  mapAgentDraftExchangeToGeneratedDraft,
} from './agentDraftImport'

const specimen = JSON.stringify({
  title: '潮汐檔案',
  genre: '科幻懸疑',
  chapters: [
    {
      sequence: 1,
      title: '沉入海底的鐘',
      prose: '第一段海水覆過鐘面。\n\n第二段城市失去第一個音節。',
    },
    {
      sequence: 2,
      title: '舊港的回聲',
      prose: '第一段舊港起霧。\n\n第二段回聲折回昨天。',
    },
    {
      sequence: 3,
      title: '第四點整',
      prose: '第一段潮汐停住。\n\n第二段空白浮出水面。',
    },
  ],
})

describe('Agent Draft import use case', () => {
  it('maps the validated exchange into the existing Draft contract and evaluates quality', () => {
    const result = importAgentDraft(specimen)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.status).toBe('DRAFT')
      expect(result.draft.title).toBe('潮汐檔案')
      expect(result.draft.categoryLabel).toBe('科幻懸疑')
      expect(result.draft.chapters.map((chapter) => chapter.title)).toEqual([
        '沉入海底的鐘',
        '舊港的回聲',
        '第四點整',
      ])
      expect(result.draft.chapters.map((chapter) => chapter.prose)).toEqual([
        ['第一段海水覆過鐘面。', '第二段城市失去第一個音節。'],
        ['第一段舊港起霧。', '第二段回聲折回昨天。'],
        ['第一段潮汐停住。', '第二段空白浮出水面。'],
      ])
      expect(result.quality).toEqual(result.draft.quality)
      expect(result.quality).toEqual(
        evaluateDraftQuality({
          title: '潮汐檔案',
          categoryLabel: '科幻懸疑',
          chapters: result.draft.chapters,
        }),
      )
    }
  })

  it('does not map invalid exchange input', () => {
    expect(importAgentDraft('{not-json')).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON' }],
    })
  })

  it('preserves a single prose body as one existing Draft paragraph', () => {
    const generated = mapAgentDraftExchangeToGeneratedDraft({
      title: '一段正文',
      genre: '懸疑',
      chapters: [{ sequence: 1, title: '第一章', prose: '完整正文。' }],
    })

    expect(generated.chapters[0]?.prose).toEqual(['完整正文。'])
  })
})
