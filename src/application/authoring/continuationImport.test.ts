import { describe, expect, it } from 'vitest'
import type { Draft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { importContinuation } from './continuationImport'

function createDraft(): Draft {
  const chapters = [1, 2, 3].map((sequence) => ({
    sequence,
    title: `舊章節 ${sequence}`,
    prose: [`舊正文 ${sequence} 第一段。`, `舊正文 ${sequence} 第二段。`],
  }))
  return {
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters,
    status: 'DRAFT',
    quality: evaluateDraftQuality({
      title: '潮汐檔案',
      categoryLabel: '科幻懸疑',
      chapters,
    }),
  }
}

const continuation = JSON.stringify({
  chapters: [
    {
      sequence: 4,
      title: '新潮線',
      prose: '新章第一段。\n\n新章第二段。',
    },
    {
      sequence: 5,
      title: '回到鐘聲',
      prose: '末章第一段。\n\n末章第二段。',
    },
  ],
})

describe('continuation import', () => {
  it('appends validated chapters without changing existing chapter values', () => {
    const draft = createDraft()
    const originalChapters = draft.chapters

    const result = importContinuation(draft, continuation, 2)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.chapters.slice(0, 3)).toEqual(originalChapters)
      expect(result.draft.chapters).toHaveLength(5)
      expect(result.draft.chapters.map((chapter) => chapter.sequence)).toEqual([
        1, 2, 3, 4, 5,
      ])
      expect(result.draft.chapters[3]?.prose).toEqual([
        '新章第一段。',
        '新章第二段。',
      ])
      expect(result.draft.quality).toBe(draft.quality)
      expect(evaluateDraftQuality(result.draft).warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ chapterSequence: 4 }),
          expect.objectContaining({ chapterSequence: 5 }),
        ]),
      )
    }
  })

  it('leaves the accepted Draft untouched when continuation validation fails', () => {
    const draft = createDraft()
    const original = structuredClone(draft)

    const result = importContinuation(
      draft,
      JSON.stringify({
        chapters: [
          { sequence: 3, title: '重送舊章', prose: '不應該附加。' },
          { sequence: 4, title: '新章', prose: '不應該附加。' },
        ],
      }),
      2,
    )

    expect(result.ok).toBe(false)
    expect(draft).toEqual(original)
  })
})
