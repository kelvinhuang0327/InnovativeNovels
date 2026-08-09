import { describe, expect, it } from 'vitest'
import type { GeneratedDraft } from './authoringContracts'
import {
  evaluateDraftQuality,
  MIN_USEFUL_PROSE_PARAGRAPHS,
} from './qualityEvaluator'

function makeDraft(
  chapters: GeneratedDraft['chapters'],
): GeneratedDraft {
  return {
    title: '草稿標題',
    categoryLabel: '懸疑',
    chapters,
  }
}

const fullProse = Array.from(
  { length: MIN_USEFUL_PROSE_PARAGRAPHS },
  (_, index) => `第 ${index + 1} 段內容。`,
)

describe('draft quality evaluator', () => {
  it('passes ordered non-empty chapters with useful prose', () => {
    expect(
      evaluateDraftQuality(
        makeDraft([
          { sequence: 1, title: '第一章', prose: fullProse },
          { sequence: 2, title: '第二章', prose: fullProse.map((p) => `${p}二`) },
        ]),
      ),
    ).toEqual({ status: 'PASS', hardFailures: [], warnings: [] })
  })

  it('reports empty, unordered, and duplicate chapter structures as hard failures', () => {
    const result = evaluateDraftQuality(
      makeDraft([
        { sequence: 2, title: '', prose: [] },
        { sequence: 2, title: '重複章', prose: ['相同內容。'] },
        { sequence: 3, title: '第三章', prose: ['相同內容。'] },
      ]),
    )

    expect(result.status).toBe('FAIL')
    expect(result.hardFailures.map((issue) => issue.code)).toEqual([
      'CHAPTER_ORDER_INVALID',
      'CHAPTER_TITLE_REQUIRED',
      'CHAPTER_PROSE_REQUIRED',
      'DUPLICATE_CHAPTER_PROSE',
    ])
  })

  it('keeps a short-prose observation as a quality warning', () => {
    const result = evaluateDraftQuality(
      makeDraft([
        { sequence: 1, title: '第一章', prose: ['一段短內容。'] },
        { sequence: 2, title: '第二章', prose: ['另一段短內容。'] },
      ]),
    )

    expect(result.status).toBe('WARNING')
    expect(result.hardFailures).toEqual([])
    expect(result.warnings.map((issue) => issue.code)).toEqual([
      'PROSE_TOO_SHORT',
      'PROSE_TOO_SHORT',
    ])
  })
})
