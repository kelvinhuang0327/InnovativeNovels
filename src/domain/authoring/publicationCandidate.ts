import { CHAPTER_ACCESS } from '../access/chapterAccess'
import type { ContentBookFixtureV1 } from '../catalog/contentBookFixture'
import type { Draft } from './authoringContracts'
import { evaluateDraftQuality, type DraftQualityIssue } from './qualityEvaluator'

export const PUBLICATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface PublicationPreparationMetadata {
  readonly publicationSlug: string
  readonly authorName: string
  readonly description: string
  readonly catalogSequence?: number
}

export interface PublicationCatalogEntry {
  readonly bookId: string
  readonly chapterIds: readonly string[]
}

export type PublicationCandidateIssueCode =
  | 'PUBLICATION_SLUG_REQUIRED'
  | 'PUBLICATION_SLUG_INVALID'
  | 'AUTHOR_REQUIRED'
  | 'DESCRIPTION_REQUIRED'
  | 'CATALOG_SEQUENCE_INVALID'
  | 'DRAFT_INVALID'
  | 'BOOK_ID_COLLISION'
  | 'CHAPTER_ID_COLLISION'

export interface PublicationCandidateIssue {
  readonly code: PublicationCandidateIssueCode
  readonly message: string
  readonly chapterIds?: readonly string[]
}

export interface PublicationCandidateWarning {
  readonly code: DraftQualityIssue['code']
  readonly message: string
  readonly chapterSequence?: number
}

export type PublicationCandidateReadiness =
  | 'BLOCKED'
  | 'READY'
  | 'READY_WITH_WARNINGS'

export interface PublicationCandidateBuildResult {
  readonly readiness: PublicationCandidateReadiness
  readonly candidate?: ContentBookFixtureV1
  readonly bookId?: string
  readonly chapterIds: readonly string[]
  readonly issues: readonly PublicationCandidateIssue[]
  readonly warnings: readonly PublicationCandidateWarning[]
}

function normalized(value: string): string {
  return value.trim()
}

function issue(
  code: PublicationCandidateIssueCode,
  message: string,
): PublicationCandidateIssue {
  return { code, message }
}

function mapQualityIssue(
  qualityIssue: DraftQualityIssue,
): PublicationCandidateIssue {
  return issue('DRAFT_INVALID', qualityIssue.message)
}

export function normalizePublicationSlug(value: string): string {
  return normalized(value)
}

export function buildPublicationCandidate(
  draft: Draft,
  metadata: PublicationPreparationMetadata,
  productionCatalog: readonly PublicationCatalogEntry[] = [],
): PublicationCandidateBuildResult {
  const publicationSlug = normalizePublicationSlug(metadata.publicationSlug)
  const authorName = normalized(metadata.authorName)
  const description = normalized(metadata.description)
  const normalizedChapters = draft.chapters.map((chapter, index) => ({
    ...chapter,
    sequence: index + 1,
  }))
  const quality = evaluateDraftQuality({
    ...draft,
    chapters: normalizedChapters,
  })
  const bookId = publicationSlug ? `book-${publicationSlug}` : undefined
  const chapterIds = publicationSlug
    ? normalizedChapters.map(
        (_, index) =>
          `chapter-${publicationSlug}-${String(index + 1).padStart(3, '0')}`,
      )
    : []
  const issues: PublicationCandidateIssue[] = []

  if (publicationSlug.length === 0) {
    issues.push(issue('PUBLICATION_SLUG_REQUIRED', 'Publication slug 為必填。'))
  } else if (!PUBLICATION_SLUG_PATTERN.test(publicationSlug)) {
    issues.push(
      issue(
        'PUBLICATION_SLUG_INVALID',
        'Publication slug 只能使用小寫 ASCII 字母、數字與內部連字號。',
      ),
    )
  }

  if (authorName.length === 0) {
    issues.push(issue('AUTHOR_REQUIRED', 'Publication author name 為必填。'))
  }

  if (description.length === 0) {
    issues.push(issue('DESCRIPTION_REQUIRED', 'Publication description 為必填。'))
  }

  if (
    metadata.catalogSequence === undefined ||
    !Number.isInteger(metadata.catalogSequence) ||
    metadata.catalogSequence < 1
  ) {
    issues.push(
      issue(
        'CATALOG_SEQUENCE_INVALID',
        'Catalog sequence 必須是正整數。',
      ),
    )
  }

  issues.push(...quality.hardFailures.map(mapQualityIssue))

  if (bookId) {
    const bookCollision = productionCatalog.some(
      (entry) => entry.bookId === bookId,
    )
    if (bookCollision) {
      issues.push(
        issue(
          'BOOK_ID_COLLISION',
          `BookId ${bookId} 已存在於 production catalog，請改用不同的 publication slug。`,
        ),
      )
    }

    const existingChapterIds = new Set(
      productionCatalog.flatMap((entry) => entry.chapterIds),
    )
    const collidingChapterIds = chapterIds.filter((id) =>
      existingChapterIds.has(id),
    )
    if (collidingChapterIds.length > 0) {
      issues.push({
        code: 'CHAPTER_ID_COLLISION',
        message: `ChapterId ${collidingChapterIds.join(', ')} 已存在於 production catalog，請改用不同的 publication slug。`,
        chapterIds: collidingChapterIds,
      })
    }
  }

  const warnings = quality.warnings.map((qualityWarning) => ({
    code: qualityWarning.code,
    message: qualityWarning.message,
    chapterSequence: qualityWarning.chapterSequence,
  }))

  if (issues.length > 0 || !bookId) {
    return {
      readiness: 'BLOCKED',
      bookId,
      chapterIds,
      issues,
      warnings,
    }
  }

  const candidate: ContentBookFixtureV1 = {
    schema: 'innovative-novels/content-book/v1',
    bookId,
    catalogSequence: metadata.catalogSequence as number,
    title: normalized(draft.title),
    authorName,
    categoryLabel: normalized(draft.categoryLabel),
    description,
    chapters: normalizedChapters.map((chapter, index) => ({
      chapterId: chapterIds[index],
      sequence: index + 1,
      title: normalized(chapter.title),
      access: CHAPTER_ACCESS.READABLE,
      prose: chapter.prose
        .map((paragraph) => normalized(paragraph))
        .filter((paragraph) => paragraph.length > 0),
    })),
  }

  return {
    readiness: warnings.length > 0 ? 'READY_WITH_WARNINGS' : 'READY',
    candidate,
    bookId,
    chapterIds,
    issues,
    warnings,
  }
}
