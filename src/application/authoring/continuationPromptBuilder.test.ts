import { describe, expect, it } from 'vitest'
import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import type { StoryBibleV1 } from '../../domain/authoring/storyBible'
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

const storyBible: StoryBibleV1 = {
  characters: [
    { name: '林澄', notes: '氣象局工作；主角；追查潮汐裝置與父親留下的線索。' },
    { name: '林嶼', notes: '林澄失蹤的哥哥；曾成為潮汐裝置守門人；聲音仍可能存在於回路中。' },
  ],
  worldRules: [
    '潮汐裝置會記錄沒有被選中的未來。',
    '部分未被選中的路可能在潮汐壓力下重新靠岸。',
  ],
  openThreads: [
    '下一次低潮前找到第一座鐘。',
    '確認落後林嶼十一秒的第二個聲音是誰。',
  ],
  styleNotes: ['維持克制的科幻懸疑氛圍。', '避免用大段 exposition 一次解釋全部世界觀。'],
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

  it('injects a deterministic Story Bible without expanding recent chapter context', () => {
    const first = buildContinuationPrompt(draft, spec, 2, storyBible)
    const second = buildContinuationPrompt(draft, spec, 2, storyBible)

    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.expectedStartSequence).toBe(6)
      expect(first.prompt).toContain('STORY BIBLE — CHARACTERS')
      expect(first.prompt).toContain('林澄: 氣象局工作；主角；追查潮汐裝置與父親留下的線索。')
      expect(first.prompt).toContain('STORY BIBLE — WORLD RULES')
      expect(first.prompt).toContain('部分未被選中的路可能在潮汐壓力下重新靠岸。')
      expect(first.prompt).toContain('STORY BIBLE — OPEN THREADS')
      expect(first.prompt).toContain('確認落後林嶼十一秒的第二個聲音是誰。')
      expect(first.prompt).toContain('STORY BIBLE — STYLE NOTES')
      expect(first.prompt).toContain('避免用大段 exposition 一次解釋全部世界觀。')
      expect(first.prompt).toContain('starting at sequence 6')
      expect(first.prompt).not.toContain('第 1 章第一段。')
    }

    const changed = buildContinuationPrompt(
      draft,
      spec,
      2,
      { ...storyBible, styleNotes: ['改變風格偏好。'] },
    )
    expect(changed).not.toEqual(first)
  })

  it('keeps an empty Story Bible valid with deterministic empty markers', () => {
    const result = buildContinuationPrompt(draft, spec, 2)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.prompt.match(/- \(empty\)/g)).toHaveLength(4)
      expect(result.prompt).toContain('starting at sequence 6')
    }
  })
})
