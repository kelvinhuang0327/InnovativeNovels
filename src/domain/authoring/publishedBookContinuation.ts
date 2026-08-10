import { CHAPTER_ACCESS } from '../access/chapterAccess'
import type { Draft } from './authoringContracts'
import { evaluateDraftQuality } from './qualityEvaluator'
import type { PublishedBookSnapshot } from './publishedAppendCandidate'

export type PublishedBookContinuationIssueCode =
  | 'PUBLISHED_BOOK_MALFORMED'
  | 'PUBLISHED_BOOK_NOT_FULLY_AVAILABLE_FOR_CONTINUATION'

export interface PublishedBookContinuationIssue {
  readonly code: PublishedBookContinuationIssueCode
  readonly message: string
}

export type PublishedBookContinuationResult =
  | {
      readonly ok: true
      readonly draft: Draft
    }
  | {
      readonly ok: false
      readonly issue: PublishedBookContinuationIssue
    }

function failure(
  code: PublishedBookContinuationIssueCode,
  message: string,
): PublishedBookContinuationResult {
  return { ok: false, issue: { code, message } }
}

function hasContinuousSequences(
  chapters: readonly { readonly sequence: number }[],
): boolean {
  return chapters.every((chapter, index) => chapter.sequence === index + 1)
}

export function buildPublishedBookContinuationDraft(
  publishedBook: PublishedBookSnapshot,
): PublishedBookContinuationResult {
  if (
    publishedBook.bookId.trim().length === 0 ||
    publishedBook.title.trim().length === 0 ||
    publishedBook.categoryLabel.trim().length === 0 ||
    publishedBook.description.trim().length === 0 ||
    publishedBook.chapters.length === 0 ||
    !hasContinuousSequences(publishedBook.chapters)
  ) {
    return failure(
      'PUBLISHED_BOOK_MALFORMED',
      'PUBLISHED_BOOK_MALFORMED: published book 的 metadata 或 chapter sequence 無法建立有效 Draft。',
    )
  }

  const unavailableChapter = publishedBook.chapters.find(
    (chapter) =>
      (chapter.access === CHAPTER_ACCESS.LOCKED ||
        chapter.access === CHAPTER_ACCESS.UNAVAILABLE ||
        chapter.prose === undefined ||
        chapter.prose.length === 0 ||
        chapter.prose.some((paragraph) => paragraph.trim().length === 0)),
  )

  if (unavailableChapter) {
    return failure(
      'PUBLISHED_BOOK_NOT_FULLY_AVAILABLE_FOR_CONTINUATION',
      `PUBLISHED_BOOK_NOT_FULLY_AVAILABLE_FOR_CONTINUATION: 第 ${unavailableChapter.sequence} 章沒有可讀取的完整正文。`,
    )
  }

  const generatedDraft = {
    title: publishedBook.title,
    categoryLabel: publishedBook.categoryLabel,
    chapters: publishedBook.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: [...(chapter.prose ?? [])],
    })),
  }

  return {
    ok: true,
    draft: {
      ...generatedDraft,
      status: 'DRAFT',
      quality: evaluateDraftQuality(generatedDraft),
    },
  }
}
