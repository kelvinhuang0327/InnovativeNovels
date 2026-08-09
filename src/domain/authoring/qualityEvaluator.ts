import type { GeneratedDraft } from './authoringContracts'

export const MIN_USEFUL_PROSE_PARAGRAPHS = 5

export interface DraftQualityIssue {
  readonly code:
    | 'TITLE_REQUIRED'
    | 'CATEGORY_REQUIRED'
    | 'CHAPTERS_REQUIRED'
    | 'CHAPTER_ORDER_INVALID'
    | 'CHAPTER_TITLE_REQUIRED'
    | 'CHAPTER_PROSE_REQUIRED'
    | 'DUPLICATE_CHAPTER_PROSE'
    | 'PROSE_TOO_SHORT'
  readonly message: string
  readonly chapterSequence?: number
}

export type DraftQualityStatus = 'PASS' | 'WARNING' | 'FAIL'

export interface DraftQualityResult {
  readonly status: DraftQualityStatus
  readonly hardFailures: readonly DraftQualityIssue[]
  readonly warnings: readonly DraftQualityIssue[]
}

export function evaluateDraftQuality(
  draft: GeneratedDraft,
): DraftQualityResult {
  const hardFailures: DraftQualityIssue[] = []
  const warnings: DraftQualityIssue[] = []

  if (draft.title.trim().length === 0) {
    hardFailures.push({
      code: 'TITLE_REQUIRED',
      message: '草稿必須有標題。',
    })
  }

  if (draft.categoryLabel.trim().length === 0) {
    hardFailures.push({
      code: 'CATEGORY_REQUIRED',
      message: '草稿必須有分類。',
    })
  }

  if (draft.chapters.length === 0) {
    hardFailures.push({
      code: 'CHAPTERS_REQUIRED',
      message: '草稿至少需要一個章節。',
    })
  }

  const proseBodies = new Set<string>()
  draft.chapters.forEach((chapter, index) => {
    const expectedSequence = index + 1
    if (chapter.sequence !== expectedSequence) {
      hardFailures.push({
        code: 'CHAPTER_ORDER_INVALID',
        message: `章節順序不連續：預期第 ${expectedSequence} 章。`,
        chapterSequence: chapter.sequence,
      })
    }

    if (chapter.title.trim().length === 0) {
      hardFailures.push({
        code: 'CHAPTER_TITLE_REQUIRED',
        message: `第 ${chapter.sequence} 章必須有章節標題。`,
        chapterSequence: chapter.sequence,
      })
    }

    const normalizedProse = chapter.prose
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)

    if (normalizedProse.length === 0) {
      hardFailures.push({
        code: 'CHAPTER_PROSE_REQUIRED',
        message: `第 ${chapter.sequence} 章必須有內容。`,
        chapterSequence: chapter.sequence,
      })
      return
    }

    const body = normalizedProse.join('\n')
    if (proseBodies.has(body)) {
      hardFailures.push({
        code: 'DUPLICATE_CHAPTER_PROSE',
        message: `第 ${chapter.sequence} 章與其他章節內容重複。`,
        chapterSequence: chapter.sequence,
      })
    }
    proseBodies.add(body)

    if (normalizedProse.length < MIN_USEFUL_PROSE_PARAGRAPHS) {
      warnings.push({
        code: 'PROSE_TOO_SHORT',
        message: `第 ${chapter.sequence} 章少於 ${MIN_USEFUL_PROSE_PARAGRAPHS} 段，建議補充內容。`,
        chapterSequence: chapter.sequence,
      })
    }
  })

  return {
    status:
      hardFailures.length > 0
        ? 'FAIL'
        : warnings.length > 0
          ? 'WARNING'
          : 'PASS',
    hardFailures,
    warnings,
  }
}
