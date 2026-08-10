import { describe, expect, it } from 'vitest'
import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import {
  buildContinuationContext,
  buildContinuationPrompt,
  CONTINUATION_CONTEXT_CHAPTER_WINDOW,
} from './continuationPromptBuilder'

const spec: AuthoringSpec = {
  premise: '潮水每天提早一分鐘退去。',
  genre: '科幻懸疑',
  instructions: '保留鐘聲線索。',
}

const draft: Draft = {
  title: '潮汐檔案',
  categoryLabel: '科幻懸疑',
  chapters: [1, 2, 3, 4, 5].map((sequence) => ({
    sequence,
    title: `章節 ${sequence}`,
    prose: [`第 ${sequence} 章第一段。`, `第 ${sequence} 章第二段。`],
  })),
  status: 'DRAFT',
  quality: evaluateDraftQuality({
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters: [1, 2, 3, 4, 5].map((sequence) => ({
      sequence,
      title: `章節 ${sequence}`,
      prose: [`第 ${sequence} 章第一段。`, `第 ${sequence} 章第二段。`],
    })),
  }),
}

describe('continuation prompt builder', () => {
  it('uses a deterministic bounded context and the next sequence', () => {
    const context = buildContinuationContext(draft, spec)

    expect(context.existingChapterTitles).toEqual([
      '章節 1',
      '章節 2',
      '章節 3',
      '章節 4',
      '章節 5',
    ])
    expect(context.recentChapters).toHaveLength(
      CONTINUATION_CONTEXT_CHAPTER_WINDOW,
    )
    expect(context.recentChapters.map((chapter) => chapter.sequence)).toEqual([
      3, 4, 5,
    ])

    const result = buildContinuationPrompt(draft, spec, 2)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.expectedStartSequence).toBe(6)
      expect(result.prompt).toContain('Role: Novel Continuation Agent')
      expect(result.prompt).toContain('exactly 2 new chapter(s)')
      expect(result.prompt).toContain('starting at sequence 6')
      expect(result.prompt).toContain('潮水每天提早一分鐘退去。')
      expect(result.prompt).toContain('章節 3')
      expect(result.prompt).toContain('章節 5')
      expect(result.prompt).not.toContain('第 1 章第一段。')
      expect(result.prompt).toContain('no title, genre, BookId, publicationSlug')
      expect(result.prompt).not.toContain('openai')
      expect(result.prompt).not.toContain('anthropic')
    }
  })

  it('rejects invalid counts and structurally invalid Drafts', () => {
    expect(buildContinuationPrompt(draft, spec, 6)).toMatchObject({
      ok: false,
    })

    const invalidDraft: Draft = {
      ...draft,
      chapters: [{ sequence: 1, title: '', prose: [] }],
      quality: evaluateDraftQuality({
        ...draft,
        chapters: [{ sequence: 1, title: '', prose: [] }],
      }),
    }
    expect(buildContinuationPrompt(invalidDraft, spec, 2)).toMatchObject({
      ok: false,
      message: '目前 Draft 有硬性驗證失敗，請先修正後再續寫。',
    })
  })
})
