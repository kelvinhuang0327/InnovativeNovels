import { CHAPTER_ACCESS, type ChapterAccess } from '../access/chapterAccess'
import {
  CONTENT_BOOK_SCHEMA,
  type ContentBookFixtureV1,
  type ContentBookFixtureChapterV1,
} from '../catalog/contentBookFixture'
import type { Draft } from './authoringContracts'
import { evaluateDraftQuality, type DraftQualityIssue, type DraftQualityResult } from './qualityEvaluator'

export const PUBLISHED_APPEND_CANDIDATE_SCHEMA_VERSION = 1 as const

export interface PublishedBookSnapshotChapter {
  readonly chapterId: string
  readonly sequence: number
  readonly title: string
  readonly access: ChapterAccess
  readonly prose?: readonly string[]
}

export interface PublishedBookSnapshot {
  readonly schema: typeof CONTENT_BOOK_SCHEMA
  readonly bookId: string
  readonly catalogSequence: number
  readonly title: string
  readonly authorName: string
  readonly categoryLabel: string
  readonly description: string
  readonly chapters: readonly PublishedBookSnapshotChapter[]
}

export interface PublishedBookSource {
  readonly book: {
    readonly id: string
    readonly title: string
    readonly authorName: string
    readonly categoryLabel: string
  }
  readonly catalogSequence?: number
  readonly description: string
  readonly chapters: readonly PublishedBookSnapshotChapter[]
}

export interface PublishedAppendCandidateChapter {
  readonly chapterId: string
  readonly sequence: number
  readonly title: string
  readonly access: typeof CHAPTER_ACCESS.READABLE
  readonly prose: readonly string[]
}

export interface PublishedAppendCandidateWarning {
  readonly code: DraftQualityIssue['code']
  readonly message: string
  readonly chapterSequence?: number
}

export interface PublishedAppendCandidateValidation {
  readonly status: 'PASS'
  readonly validator: 'production-content-fixture-v1'
}

export interface PublishedAppendCandidate {
  readonly schemaVersion: typeof PUBLISHED_APPEND_CANDIDATE_SCHEMA_VERSION
  readonly readiness: 'READY' | 'READY_WITH_WARNINGS'
  readonly targetPublishedBookId: string
  readonly bookId: string
  readonly baseFixtureFingerprint: string
  readonly draftFingerprint: string
  readonly publishedChapterCount: number
  readonly lastPublishedSequence: number
  readonly appendedChapters: readonly PublishedAppendCandidateChapter[]
  readonly updatedFixturePreview: ContentBookFixtureV1
  readonly quality: DraftQualityResult
  readonly warnings: readonly PublishedAppendCandidateWarning[]
  readonly validation: PublishedAppendCandidateValidation
}

export type PublishedAppendCandidateIssueCode =
  | 'TARGET_BOOK_REQUIRED'
  | 'TARGET_BOOK_NOT_FOUND'
  | 'TARGET_BOOK_METADATA_UNAVAILABLE'
  | 'PUBLISHED_SEQUENCE_INVALID'
  | 'TITLE_MISMATCH'
  | 'GENRE_MISMATCH'
  | 'DRAFT_INVALID'
  | 'QUALITY_STALE'
  | 'DRAFT_SHORTER_THAN_PUBLISHED'
  | 'NO_NEW_CHAPTER'
  | 'DRAFT_SEQUENCE_INVALID'
  | 'PUBLISHED_CHAPTER_CHANGED'
  | 'APPENDED_CHAPTER_PROSE_REQUIRED'
  | 'CHAPTER_ID_COLLISION'
  | 'PRODUCTION_VALIDATION_UNAVAILABLE'
  | 'PRODUCTION_FIXTURE_INVALID'
  | 'FINGERPRINT_UNAVAILABLE'

export interface PublishedAppendCandidateIssue {
  readonly code: PublishedAppendCandidateIssueCode
  readonly message: string
  readonly chapterIds?: readonly string[]
}

export type PublishedAppendCandidateReadiness =
  | 'BLOCKED'
  | 'READY'
  | 'READY_WITH_WARNINGS'

export interface PublishedAppendCandidateBuildResult {
  readonly readiness: PublishedAppendCandidateReadiness
  readonly targetPublishedBookId?: string
  readonly baseFixtureFingerprint?: string
  readonly publishedChapterCount: number
  readonly proposedAppendedChapterCount: number
  readonly quality?: DraftQualityResult
  readonly validation: {
    readonly status: 'PASS' | 'FAIL' | 'NOT_RUN'
    readonly message?: string
  }
  readonly issues: readonly PublishedAppendCandidateIssue[]
  readonly warnings: readonly PublishedAppendCandidateWarning[]
  readonly candidate?: PublishedAppendCandidate
}

export type ProductionFixtureValidator = (
  fixture: ContentBookFixtureV1,
) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return Object.keys(value).every((field) => fields.includes(field))
}

function issue(
  code: PublishedAppendCandidateIssueCode,
  message: string,
  chapterIds?: readonly string[],
): PublishedAppendCandidateIssue {
  return chapterIds ? { code, message, chapterIds } : { code, message }
}

function canonicalChapter(
  chapter: ContentBookFixtureChapterV1,
): ContentBookFixtureChapterV1 {
  const base = {
    chapterId: chapter.chapterId,
    sequence: chapter.sequence,
    title: chapter.title,
    access: chapter.access,
  }

  return chapter.prose === undefined
    ? base
    : { ...base, prose: [...chapter.prose] }
}

export function serializeProductionFixture(
  fixture: ContentBookFixtureV1,
): string {
  return JSON.stringify({
    schema: fixture.schema,
    bookId: fixture.bookId,
    catalogSequence: fixture.catalogSequence,
    title: fixture.title,
    authorName: fixture.authorName,
    categoryLabel: fixture.categoryLabel,
    description: fixture.description,
    chapters: fixture.chapters.map(canonicalChapter),
  })
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable.')
  }

  const bytes = new TextEncoder().encode(value)
  const digest = await subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function snapshotToFixture(
  snapshot: PublishedBookSnapshot,
): ContentBookFixtureV1 {
  return {
    schema: snapshot.schema,
    bookId: snapshot.bookId,
    catalogSequence: snapshot.catalogSequence,
    title: snapshot.title,
    authorName: snapshot.authorName,
    categoryLabel: snapshot.categoryLabel,
    description: snapshot.description,
    chapters: snapshot.chapters.map((chapter) => canonicalChapter(chapter)),
  }
}

export function createPublishedBookSnapshot(
  source: PublishedBookSource,
  getChapterProse: (chapterId: string) => readonly string[] | undefined,
): PublishedBookSnapshot | undefined {
  if (
    source.catalogSequence === undefined ||
    !Number.isInteger(source.catalogSequence) ||
    source.catalogSequence < 1
  ) {
    return undefined
  }

  return {
    schema: CONTENT_BOOK_SCHEMA,
    bookId: source.book.id,
    catalogSequence: source.catalogSequence,
    title: source.book.title,
    authorName: source.book.authorName,
    categoryLabel: source.book.categoryLabel,
    description: source.description,
    chapters: source.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      sequence: chapter.sequence,
      title: chapter.title,
      access: chapter.access,
      prose: getChapterProse(chapter.chapterId),
    })),
  }
}

export async function fingerprintPublishedBook(
  snapshot: PublishedBookSnapshot,
): Promise<string> {
  return sha256(serializeProductionFixture(snapshotToFixture(snapshot)))
}

function serializeDraftForFingerprint(
  targetPublishedBookId: string,
  draft: Draft,
): string {
  return JSON.stringify({
    targetPublishedBookId,
    title: draft.title,
    categoryLabel: draft.categoryLabel,
    chapters: draft.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: [...chapter.prose],
    })),
  })
}

export async function fingerprintAppendDraft(
  targetPublishedBookId: string,
  draft: Draft,
): Promise<string> {
  return sha256(serializeDraftForFingerprint(targetPublishedBookId, draft))
}

function paragraphsEqual(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  if (!left || left.length !== right.length) {
    return false
  }

  return left.every((paragraph, index) => paragraph === right[index])
}

function chapterSequenceIsContinuous(
  chapters: readonly { readonly sequence: number }[],
): boolean {
  return chapters.every((chapter, index) => chapter.sequence === index + 1)
}

function mapWarnings(
  quality: DraftQualityResult,
): readonly PublishedAppendCandidateWarning[] {
  return quality.warnings.map((warning) => ({
    code: warning.code,
    message: warning.message,
    chapterSequence: warning.chapterSequence,
  }))
}

function qualityIsCurrent(
  draft: Draft,
  currentQuality: DraftQualityResult,
): boolean {
  return JSON.stringify(draft.quality) === JSON.stringify(currentQuality)
}

function chapterIdForAppend(bookId: string, sequence: number): string {
  const slug = bookId.startsWith('book-') ? bookId.slice('book-'.length) : bookId
  return `chapter-${slug}-${String(sequence).padStart(3, '0')}`
}

export async function buildPublishedAppendCandidate({
  draft,
  targetPublishedBookId,
  publishedBook,
  allProductionChapterIds,
  validateProductionFixture,
}: {
  readonly draft: Draft
  readonly targetPublishedBookId?: string
  readonly publishedBook?: PublishedBookSnapshot
  readonly allProductionChapterIds: readonly string[]
  readonly validateProductionFixture?: ProductionFixtureValidator
}): Promise<PublishedAppendCandidateBuildResult> {
  const currentQuality = evaluateDraftQuality(draft)
  const warnings = mapWarnings(currentQuality)
  const issues: PublishedAppendCandidateIssue[] = []
  const selectedTarget = targetPublishedBookId?.trim()

  if (!selectedTarget) {
    issues.push(issue('TARGET_BOOK_REQUIRED', '請先選擇要附加章節的 published book。'))
  } else if (!publishedBook) {
    issues.push(issue('TARGET_BOOK_NOT_FOUND', `找不到 published book ${selectedTarget}。`))
  } else if (publishedBook.bookId !== selectedTarget) {
    issues.push(
      issue(
        'TARGET_BOOK_METADATA_UNAVAILABLE',
        `Published book identity 不一致：選擇 ${selectedTarget}，實際資料為 ${publishedBook.bookId}。`,
      ),
    )
  }

  const publishedChapterCount = publishedBook?.chapters.length ?? 0
  const proposedAppendedChapterCount = Math.max(
    draft.chapters.length - publishedChapterCount,
    0,
  )
  let baseFixtureFingerprint: string | undefined

  if (publishedBook) {
    try {
      baseFixtureFingerprint = await fingerprintPublishedBook(publishedBook)
    } catch (error) {
      issues.push(
        issue(
          'FINGERPRINT_UNAVAILABLE',
          error instanceof Error ? error.message : '無法建立 production base fingerprint。',
        ),
      )
    }

    if (!chapterSequenceIsContinuous(publishedBook.chapters)) {
      issues.push(
        issue(
          'PUBLISHED_SEQUENCE_INVALID',
          'Published book 的既有章節 sequence 必須從 1 開始連續排列。',
        ),
      )
    }

    if (draft.title !== publishedBook.title) {
      issues.push(
        issue(
          'TITLE_MISMATCH',
          `Draft title 必須維持 published book title「${publishedBook.title}」。`,
        ),
      )
    }

    if (draft.categoryLabel !== publishedBook.categoryLabel) {
      issues.push(
        issue(
          'GENRE_MISMATCH',
          `Draft genre 必須維持 published book genre「${publishedBook.categoryLabel}」。`,
        ),
      )
    }
  }

  if (!qualityIsCurrent(draft, currentQuality)) {
    issues.push(
      issue(
        'QUALITY_STALE',
        'Draft quality result 已過期，請先重新執行 Re-check Quality。',
      ),
    )
  }

  if (currentQuality.hardFailures.length > 0) {
    issues.push(
      ...currentQuality.hardFailures.map((qualityIssue) =>
        issue('DRAFT_INVALID', qualityIssue.message),
      ),
    )
  }

  if (publishedBook && draft.chapters.length < publishedChapterCount) {
    issues.push(
      issue(
        'DRAFT_SHORTER_THAN_PUBLISHED',
        `Draft 只有 ${draft.chapters.length} 章，不能少於 published book 的 ${publishedChapterCount} 章。`,
      ),
    )
  } else if (publishedBook && draft.chapters.length === publishedChapterCount) {
    issues.push(
      issue(
        'NO_NEW_CHAPTER',
        'Draft 沒有比 published book 多出任何新章節。',
      ),
    )
  }

  if (!chapterSequenceIsContinuous(draft.chapters)) {
    issues.push(
      issue(
        'DRAFT_SEQUENCE_INVALID',
        'Reviewed Draft 的 chapter sequence 必須從 1 開始連續排列，不能重排或跳號。',
      ),
    )
  }

  if (publishedBook) {
    publishedBook.chapters.forEach((publishedChapter, index) => {
      const draftChapter = draft.chapters[index]
      if (!draftChapter) {
        return
      }

      if (
        draftChapter.sequence !== publishedChapter.sequence ||
        draftChapter.title !== publishedChapter.title ||
        !paragraphsEqual(publishedChapter.prose, draftChapter.prose)
      ) {
        issues.push(
          issue(
            'PUBLISHED_CHAPTER_CHANGED',
            `第 ${publishedChapter.sequence} 章的既有 title、順序或 prose 與 production 不一致；append-only candidate 拒絕修改已出版內容。`,
          ),
        )
      }
    })
  }

  const appendedDraftChapters =
    publishedBook && draft.chapters.length > publishedChapterCount
      ? draft.chapters.slice(publishedChapterCount)
      : []

  const appendedChapterIds = publishedBook
    ? appendedDraftChapters.map((chapter) =>
        chapterIdForAppend(publishedBook.bookId, chapter.sequence),
      )
    : []
  const existingChapterIds = new Set(allProductionChapterIds)
  const collidingChapterIds = appendedChapterIds.filter((chapterId) =>
    existingChapterIds.has(chapterId),
  )
  if (collidingChapterIds.length > 0) {
    issues.push(
      issue(
        'CHAPTER_ID_COLLISION',
        `新章節 ChapterId 已存在於 production catalog：${collidingChapterIds.join(', ')}。`,
        collidingChapterIds,
      ),
    )
  }

  appendedDraftChapters.forEach((chapter) => {
    if (
      chapter.sequence !== publishedChapterCount +
        appendedDraftChapters.indexOf(chapter) +
        1
    ) {
      issues.push(
        issue(
          'DRAFT_SEQUENCE_INVALID',
          'Append delta 必須從 published 最後章節之後連續排列。',
        ),
      )
    }
    if (
      chapter.title.trim().length === 0 ||
      chapter.prose.length === 0 ||
      chapter.prose.every((paragraph) => paragraph.trim().length === 0)
    ) {
      issues.push(
        issue(
          'APPENDED_CHAPTER_PROSE_REQUIRED',
          `第 ${chapter.sequence} 章必須有非空正文，不能建立空白 append chapter。`,
        ),
      )
    }
  })

  if (
    issues.length > 0 ||
    !publishedBook ||
    !selectedTarget ||
    !baseFixtureFingerprint ||
    appendedDraftChapters.length === 0
  ) {
    return {
      readiness: 'BLOCKED',
      targetPublishedBookId: selectedTarget,
      baseFixtureFingerprint,
      publishedChapterCount,
      proposedAppendedChapterCount,
      quality: currentQuality,
      validation: { status: 'NOT_RUN' },
      issues,
      warnings,
    }
  }

  if (!validateProductionFixture) {
    return {
      readiness: 'BLOCKED',
      targetPublishedBookId: selectedTarget,
      baseFixtureFingerprint,
      publishedChapterCount,
      proposedAppendedChapterCount,
      quality: currentQuality,
      validation: {
        status: 'FAIL',
        message: 'Production validator 未連接，不能宣告 append candidate ready。',
      },
      issues: [
        ...issues,
        issue(
          'PRODUCTION_VALIDATION_UNAVAILABLE',
          'Production validator 未連接，不能建立 READY append candidate。',
        ),
      ],
      warnings,
    }
  }

  const preview: ContentBookFixtureV1 = {
    ...snapshotToFixture(publishedBook),
    chapters: [
      ...snapshotToFixture(publishedBook).chapters,
      ...appendedDraftChapters.map((chapter, index) => ({
        chapterId: appendedChapterIds[index],
        sequence: chapter.sequence,
        title: chapter.title,
        access: CHAPTER_ACCESS.READABLE,
        prose: [...chapter.prose],
      })),
    ],
  }

  let validation: PublishedAppendCandidateValidation
  try {
    validateProductionFixture(preview)
    validation = {
      status: 'PASS',
      validator: 'production-content-fixture-v1',
    }
  } catch (error) {
    return {
      readiness: 'BLOCKED',
      targetPublishedBookId: selectedTarget,
      baseFixtureFingerprint,
      publishedChapterCount,
      proposedAppendedChapterCount,
      quality: currentQuality,
      validation: {
        status: 'FAIL',
        message:
          error instanceof Error
            ? error.message
            : 'Production fixture preview validation failed.',
      },
      issues: [
        ...issues,
        issue(
          'PRODUCTION_FIXTURE_INVALID',
          error instanceof Error
            ? error.message
            : 'Production fixture preview validation failed.',
        ),
      ],
      warnings,
    }
  }

  const draftFingerprint = await fingerprintAppendDraft(selectedTarget, draft)
  const readiness = warnings.length > 0 ? 'READY_WITH_WARNINGS' : 'READY'
  const appendedChapters: readonly PublishedAppendCandidateChapter[] =
    appendedDraftChapters.map((chapter, index) => ({
      chapterId: appendedChapterIds[index],
      sequence: chapter.sequence,
      title: chapter.title,
      access: CHAPTER_ACCESS.READABLE,
      prose: [...chapter.prose],
    }))

  return {
    readiness,
    targetPublishedBookId: selectedTarget,
    baseFixtureFingerprint,
    publishedChapterCount,
    proposedAppendedChapterCount,
    quality: currentQuality,
    validation,
    issues,
    warnings,
    candidate: {
      schemaVersion: PUBLISHED_APPEND_CANDIDATE_SCHEMA_VERSION,
      readiness,
      targetPublishedBookId: selectedTarget,
      bookId: publishedBook.bookId,
      baseFixtureFingerprint,
      draftFingerprint,
      publishedChapterCount,
      lastPublishedSequence:
        publishedBook.chapters[publishedBook.chapters.length - 1].sequence,
      appendedChapters,
      updatedFixturePreview: preview,
      quality: currentQuality,
      warnings,
      validation,
    },
  }
}

export async function isPublishedAppendCandidateCurrent(
  candidate: PublishedAppendCandidate,
  draft: Draft,
  targetPublishedBookId: string | undefined,
  publishedBook: PublishedBookSnapshot | undefined,
): Promise<boolean> {
  if (!targetPublishedBookId || !publishedBook) {
    return false
  }

  const [baseFingerprint, draftFingerprint] = await Promise.all([
    fingerprintPublishedBook(publishedBook),
    fingerprintAppendDraft(targetPublishedBookId, draft),
  ])

  return (
    candidate.targetPublishedBookId === targetPublishedBookId &&
    candidate.bookId === publishedBook.bookId &&
    candidate.baseFixtureFingerprint === baseFingerprint &&
    candidate.draftFingerprint === draftFingerprint &&
    qualityIsCurrent(draft, evaluateDraftQuality(draft))
  )
}

export function exportPublishedAppendCandidate(
  candidate: PublishedAppendCandidate,
): string {
  return JSON.stringify(candidate, null, 2)
}

function isQualityIssue(value: unknown): value is DraftQualityIssue {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.chapterSequence === undefined || typeof value.chapterSequence === 'number')
  )
}

function isQualityResult(value: unknown): value is DraftQualityResult {
  return (
    isRecord(value) &&
    (value.status === 'PASS' || value.status === 'WARNING' || value.status === 'FAIL') &&
    Array.isArray(value.hardFailures) &&
    value.hardFailures.every(isQualityIssue) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isQualityIssue)
  )
}

function isContentBookFixture(value: unknown): value is ContentBookFixtureV1 {
  if (
    !isRecord(value) ||
    value.schema !== CONTENT_BOOK_SCHEMA ||
    typeof value.bookId !== 'string' ||
    typeof value.catalogSequence !== 'number' ||
    typeof value.title !== 'string' ||
    typeof value.authorName !== 'string' ||
    typeof value.categoryLabel !== 'string' ||
    typeof value.description !== 'string' ||
    !Array.isArray(value.chapters)
  ) {
    return false
  }

  return value.chapters.every((chapter) => {
    if (
      !isRecord(chapter) ||
      typeof chapter.chapterId !== 'string' ||
      typeof chapter.sequence !== 'number' ||
      typeof chapter.title !== 'string' ||
      typeof chapter.access !== 'string'
    ) {
      return false
    }

    return (
      chapter.prose === undefined ||
      (Array.isArray(chapter.prose) &&
        chapter.prose.every((paragraph) => typeof paragraph === 'string'))
    )
  })
}

function isPublishedAppendCandidateChapter(
  value: unknown,
): value is PublishedAppendCandidateChapter {
  return (
    isRecord(value) &&
    typeof value.chapterId === 'string' &&
    typeof value.sequence === 'number' &&
    typeof value.title === 'string' &&
    value.access === CHAPTER_ACCESS.READABLE &&
    Array.isArray(value.prose) &&
    value.prose.every((paragraph) => typeof paragraph === 'string')
  )
}

export function parsePublishedAppendCandidate(
  value: unknown,
): PublishedAppendCandidate | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, [
      'schemaVersion',
      'readiness',
      'targetPublishedBookId',
      'bookId',
      'baseFixtureFingerprint',
      'draftFingerprint',
      'publishedChapterCount',
      'lastPublishedSequence',
      'appendedChapters',
      'updatedFixturePreview',
      'quality',
      'warnings',
      'validation',
    ]) ||
    value.schemaVersion !== PUBLISHED_APPEND_CANDIDATE_SCHEMA_VERSION ||
    (value.readiness !== 'READY' && value.readiness !== 'READY_WITH_WARNINGS') ||
    typeof value.targetPublishedBookId !== 'string' ||
    typeof value.bookId !== 'string' ||
    typeof value.baseFixtureFingerprint !== 'string' ||
    typeof value.draftFingerprint !== 'string' ||
    typeof value.publishedChapterCount !== 'number' ||
    typeof value.lastPublishedSequence !== 'number' ||
    !Array.isArray(value.appendedChapters) ||
    !value.appendedChapters.every(isPublishedAppendCandidateChapter) ||
    !isContentBookFixture(value.updatedFixturePreview) ||
    !isQualityResult(value.quality) ||
    !Array.isArray(value.warnings) ||
    !value.warnings.every(isQualityIssue) ||
    !isRecord(value.validation) ||
    !hasOnlyFields(value.validation, ['status', 'validator']) ||
    value.validation.status !== 'PASS' ||
    value.validation.validator !== 'production-content-fixture-v1'
  ) {
    return undefined
  }

  return value as unknown as PublishedAppendCandidate
}
