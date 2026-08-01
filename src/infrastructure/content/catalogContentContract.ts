import type { Book } from '../../domain/catalog/book'
import { CHAPTER_ACCESS, type ChapterAccess } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId as toBookId, chapterId as toChapterId } from '../../domain/catalog/identifiers'

export const CONTENT_BOOK_SCHEMA = 'innovative-novels/content-book/v1'

export type ContentImportReason =
  | 'INVALID_ROOT'
  | 'UNKNOWN_SCHEMA'
  | 'UNKNOWN_KEY'
  | 'MISSING_FIELD'
  | 'MALFORMED_VALUE'
  | 'FILENAME_MISMATCH'
  | 'UNKNOWN_ACCESS'
  | 'ACCESSIBLE_CHAPTER_MISSING_PROSE'
  | 'INACCESSIBLE_CHAPTER_HAS_PROSE'
  | 'DUPLICATE_CHAPTER_SEQUENCE'
  | 'DUPLICATE_BOOK_ID'
  | 'DUPLICATE_CATALOG_SEQUENCE'
  | 'DUPLICATE_CHAPTER_ID'

export class ContentImportError extends Error {
  readonly fixturePath: string
  readonly reason: ContentImportReason
  readonly field?: string

  constructor(fixturePath: string, reason: ContentImportReason, field?: string) {
    super(
      `ContentImportError[${reason}] at "${fixturePath}"${
        field ? ` (field: ${field})` : ''
      }`,
    )
    this.name = 'ContentImportError'
    this.fixturePath = fixturePath
    this.reason = reason
    this.field = field
  }
}

export interface ParsedContentChapter {
  readonly chapter: Chapter
  readonly prose?: readonly string[]
}

export interface ParsedContentBook {
  readonly catalogSequence: number
  readonly book: Book
  readonly description: string
  readonly chapters: readonly ParsedContentChapter[]
}

const ACCESSIBLE_VALUES: readonly ChapterAccess[] = [
  CHAPTER_ACCESS.READABLE,
  CHAPTER_ACCESS.PREVIEW,
]
const KNOWN_ACCESS_VALUES: readonly string[] = Object.values(CHAPTER_ACCESS)

const BOOK_FIXTURE_KEYS = [
  'schema',
  'bookId',
  'catalogSequence',
  'title',
  'authorName',
  'categoryLabel',
  'description',
  'chapters',
] as const

const CHAPTER_FIXTURE_KEYS = [
  'chapterId',
  'sequence',
  'title',
  'access',
  'prose',
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  )
}

function assertNoUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  fixturePath: string,
  fieldPrefix: string,
): void {
  for (const key of Object.keys(value)) {
    if (!(allowedKeys as readonly string[]).includes(key)) {
      throw new ContentImportError(
        fixturePath,
        'UNKNOWN_KEY',
        `${fieldPrefix}.${key}`,
      )
    }
  }
}

function requireNonEmptyString(
  value: unknown,
  fixturePath: string,
  field: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContentImportError(fixturePath, 'MALFORMED_VALUE', field)
  }

  return value
}

function requirePositiveInteger(
  value: unknown,
  fixturePath: string,
  field: string,
): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ContentImportError(fixturePath, 'MALFORMED_VALUE', field)
  }

  return value
}

export function expectedBookIdForFixturePath(fixturePath: string): string {
  const match = /([^/\\]+)\.json$/.exec(fixturePath)

  if (!match) {
    throw new ContentImportError(fixturePath, 'FILENAME_MISMATCH', 'bookId')
  }

  return match[1]
}

function parseChapterFixture(
  raw: unknown,
  fixturePath: string,
  bookIdValue: string,
  index: number,
): ParsedContentChapter {
  const fieldPrefix = `chapters[${index}]`

  if (!isPlainObject(raw)) {
    throw new ContentImportError(fixturePath, 'MALFORMED_VALUE', fieldPrefix)
  }

  assertNoUnknownKeys(raw, CHAPTER_FIXTURE_KEYS, fixturePath, fieldPrefix)

  const chapterIdValue = requireNonEmptyString(
    raw.chapterId,
    fixturePath,
    `${fieldPrefix}.chapterId`,
  )
  const sequenceValue = requirePositiveInteger(
    raw.sequence,
    fixturePath,
    `${fieldPrefix}.sequence`,
  )
  const title = requireNonEmptyString(
    raw.title,
    fixturePath,
    `${fieldPrefix}.title`,
  )

  if (
    typeof raw.access !== 'string' ||
    !KNOWN_ACCESS_VALUES.includes(raw.access)
  ) {
    throw new ContentImportError(
      fixturePath,
      'UNKNOWN_ACCESS',
      `${fieldPrefix}.access`,
    )
  }

  const access = raw.access as ChapterAccess
  const isAccessible = (ACCESSIBLE_VALUES as readonly string[]).includes(
    access,
  )

  if (isAccessible) {
    if (!Array.isArray(raw.prose) || raw.prose.length === 0) {
      throw new ContentImportError(
        fixturePath,
        'ACCESSIBLE_CHAPTER_MISSING_PROSE',
        `${fieldPrefix}.prose`,
      )
    }

    const prose = raw.prose.map((paragraph, paragraphIndex) =>
      requireNonEmptyString(
        paragraph,
        fixturePath,
        `${fieldPrefix}.prose[${paragraphIndex}]`,
      ),
    )

    return {
      chapter: {
        id: toChapterId(chapterIdValue),
        bookId: toBookId(bookIdValue),
        title,
        sequence: chapterSequence(sequenceValue),
        access,
      },
      prose,
    }
  }

  if ('prose' in raw) {
    throw new ContentImportError(
      fixturePath,
      'INACCESSIBLE_CHAPTER_HAS_PROSE',
      `${fieldPrefix}.prose`,
    )
  }

  return {
    chapter: {
      id: toChapterId(chapterIdValue),
      bookId: toBookId(bookIdValue),
      title,
      sequence: chapterSequence(sequenceValue),
      access,
    },
  }
}

export function parseContentBookFixture(
  fixturePath: string,
  raw: unknown,
): ParsedContentBook {
  if (!isPlainObject(raw)) {
    throw new ContentImportError(fixturePath, 'INVALID_ROOT')
  }

  assertNoUnknownKeys(raw, BOOK_FIXTURE_KEYS, fixturePath, '$')

  if (raw.schema !== CONTENT_BOOK_SCHEMA) {
    throw new ContentImportError(fixturePath, 'UNKNOWN_SCHEMA', 'schema')
  }

  const bookIdValue = requireNonEmptyString(raw.bookId, fixturePath, 'bookId')
  const expectedBookId = expectedBookIdForFixturePath(fixturePath)

  if (bookIdValue !== expectedBookId) {
    throw new ContentImportError(fixturePath, 'FILENAME_MISMATCH', 'bookId')
  }

  const catalogSequence = requirePositiveInteger(
    raw.catalogSequence,
    fixturePath,
    'catalogSequence',
  )
  const title = requireNonEmptyString(raw.title, fixturePath, 'title')
  const authorName = requireNonEmptyString(
    raw.authorName,
    fixturePath,
    'authorName',
  )
  const categoryLabel = requireNonEmptyString(
    raw.categoryLabel,
    fixturePath,
    'categoryLabel',
  )
  const description = requireNonEmptyString(
    raw.description,
    fixturePath,
    'description',
  )

  if (!Array.isArray(raw.chapters) || raw.chapters.length === 0) {
    throw new ContentImportError(fixturePath, 'MALFORMED_VALUE', 'chapters')
  }

  const chapters = raw.chapters.map((chapterRaw, index) =>
    parseChapterFixture(chapterRaw, fixturePath, bookIdValue, index),
  )

  const seenSequences = new Set<number>()
  for (const { chapter } of chapters) {
    if (seenSequences.has(chapter.sequence)) {
      throw new ContentImportError(
        fixturePath,
        'DUPLICATE_CHAPTER_SEQUENCE',
        'chapters[].sequence',
      )
    }
    seenSequences.add(chapter.sequence)
  }

  return {
    catalogSequence,
    book: {
      id: toBookId(bookIdValue),
      title,
      authorName,
      categoryLabel,
    },
    description,
    chapters,
  }
}
