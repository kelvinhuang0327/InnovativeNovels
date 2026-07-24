import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import { decideChapterAccess } from '../../domain/access/chapterAccessPolicy'
import type { Chapter } from '../../domain/catalog/chapter'
import { bookId as toBookId, chapterId as toChapterId } from '../../domain/catalog/identifiers'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type { ChapterBookmarksRepository } from './chapterBookmarksRepository'
import type { ReadingStateRepository } from './readingStateRepository'

export interface ReadingDestination {
  readonly position: ReadingPosition
  readonly isContinuing: boolean
}

export interface OpenedChapter {
  readonly book: ContentBook
  readonly chapter: Chapter
  readonly prose: readonly string[]
  readonly isLocked: boolean
  readonly hasPrevious: boolean
  readonly hasNext: boolean
}

export interface BookmarkEntry {
  readonly book: ContentBook
  readonly chapter: Chapter
  readonly position: ReadingPosition
}

function chaptersByExplicitOrder(book: ContentBook): readonly Chapter[] {
  return [...book.chapters].sort(
    (left, right) => left.sequence - right.sequence,
  )
}

function chapterPosition(chapter: Chapter): ReadingPosition {
  return {
    bookId: chapter.bookId,
    chapterId: chapter.id,
    paragraphIndex: 0,
    chapterProgress: 0,
  }
}

function findReadableChapter(
  book: ContentBook,
  chapterId: string,
): Chapter | undefined {
  const chapter = book.chapters.find((candidate) => candidate.id === chapterId)

  if (!chapter || !decideChapterAccess(chapter.access).canOpen) {
    return undefined
  }

  return chapter
}

export function resolveStartOrContinue(
  contentRepository: ContentRepository,
  readingStateRepository: ReadingStateRepository,
  bookId: string,
): ReadingDestination | undefined {
  const book = contentRepository.getBook(bookId)

  if (!book) {
    return undefined
  }

  const saved = readingStateRepository.load(bookId)
  const savedChapter = saved
    ? findReadableChapter(book, saved.chapterId)
    : undefined

  if (saved && savedChapter) {
    return { position: saved, isContinuing: true }
  }

  const firstReadable = chaptersByExplicitOrder(book).find(
    (chapter) => decideChapterAccess(chapter.access).canOpen,
  )

  return firstReadable
    ? { position: chapterPosition(firstReadable), isContinuing: false }
    : undefined
}

export function openReadingChapter(
  contentRepository: ContentRepository,
  readingStateRepository: ReadingStateRepository,
  position: ReadingPosition,
): OpenedChapter | undefined {
  const book = contentRepository.getBook(position.bookId)

  if (!book) {
    return undefined
  }

  const orderedChapters = chaptersByExplicitOrder(book)
  const chapterIndex = orderedChapters.findIndex(
    (chapter) => chapter.id === position.chapterId,
  )
  const chapter = orderedChapters[chapterIndex]

  if (!chapter) {
    return undefined
  }

  const access = decideChapterAccess(chapter.access)
  let prose: readonly string[] = []

  if (access.canLoadProse) {
    prose = contentRepository.getChapterProse(chapter.id) ?? []
    readingStateRepository.save(chapterPosition(chapter))
  }

  return {
    book,
    chapter,
    prose,
    isLocked: !access.canOpen,
    hasPrevious: chapterIndex > 0,
    hasNext: chapterIndex < orderedChapters.length - 1,
  }
}

export function navigateToAdjacentChapter(
  contentRepository: ContentRepository,
  readingStateRepository: ReadingStateRepository,
  current: OpenedChapter,
  direction: -1 | 1,
): OpenedChapter | undefined {
  const orderedChapters = chaptersByExplicitOrder(current.book)
  const currentIndex = orderedChapters.findIndex(
    (chapter) => chapter.id === current.chapter.id,
  )
  const destination = orderedChapters[currentIndex + direction]

  return destination
    ? openReadingChapter(
        contentRepository,
        readingStateRepository,
        chapterPosition(destination),
      )
    : undefined
}

export interface ContinueReadingEntry {
  readonly book: ContentBook
  readonly chapter: Chapter
  readonly position: ReadingPosition
}

export function listContinueReading(
  contentRepository: ContentRepository,
  readingStateRepository: ReadingStateRepository,
): readonly ContinueReadingEntry[] {
  const savedByBookId = new Map(
    readingStateRepository
      .listSavedPositions()
      .map((position) => [position.bookId, position] as const),
  )

  const entries: ContinueReadingEntry[] = []

  for (const book of contentRepository.listBooks()) {
    const saved = savedByBookId.get(book.book.id)

    if (!saved) {
      continue
    }

    const chapter = findReadableChapter(book, saved.chapterId)

    if (!chapter) {
      continue
    }

    entries.push({ book, chapter, position: saved })
  }

  return entries
}

export function isChapterBookmarked(
  bookmarksRepository: ChapterBookmarksRepository,
  bookId: string,
  chapterId: string,
): boolean {
  return bookmarksRepository
    .list()
    .some((b) => b.bookId === bookId && b.chapterId === chapterId)
}

export function addChapterBookmark(
  contentRepository: ContentRepository,
  bookmarksRepository: ChapterBookmarksRepository,
  bookId: string,
  chapterId: string,
): boolean {
  const book = contentRepository.getBook(bookId)

  if (!book) {
    return false
  }

  const chapter = findReadableChapter(book, chapterId)

  if (!chapter) {
    return false
  }

  bookmarksRepository.add({
    bookId: toBookId(bookId),
    chapterId: toChapterId(chapterId),
  })

  return true
}

export function removeChapterBookmark(
  bookmarksRepository: ChapterBookmarksRepository,
  bookId: string,
  chapterId: string,
): void {
  bookmarksRepository.remove(bookId, chapterId)
}

export function listChapterBookmarks(
  contentRepository: ContentRepository,
  bookmarksRepository: ChapterBookmarksRepository,
): readonly BookmarkEntry[] {
  const rawBookmarks = bookmarksRepository.list()
  if (rawBookmarks.length === 0) {
    return []
  }

  const bookmarkMap = new Set(
    rawBookmarks.map((b) => `${b.bookId}:${b.chapterId}`),
  )

  const entries: BookmarkEntry[] = []

  for (const book of contentRepository.listBooks()) {
    const orderedChapters = chaptersByExplicitOrder(book)
    for (const chapter of orderedChapters) {
      if (bookmarkMap.has(`${book.book.id}:${chapter.id}`)) {
        if (decideChapterAccess(chapter.access).canOpen) {
          entries.push({
            book,
            chapter,
            position: chapterPosition(chapter),
          })
        }
      }
    }
  }

  return entries
}
