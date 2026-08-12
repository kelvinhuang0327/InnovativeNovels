import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type { BookShelfRepository } from './bookShelfRepository'
import type { RecentReadingRepository } from './recentReadingRepository'
import type { ReadingStateRepository } from '../reading/readingStateRepository'

export interface RecentReadingEntry {
  readonly book: ContentBook
  readonly position?: ReadingPosition
  readonly chapterTitle?: string
}

function uniqueBookIds(bookIds: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const bookId of bookIds) {
    if (bookId.trim().length === 0 || seen.has(bookId)) {
      continue
    }

    seen.add(bookId)
    unique.push(bookId)
  }

  return unique
}

export function resolveBooksByIds(
  contentRepository: ContentRepository,
  bookIds: readonly string[],
): readonly ContentBook[] {
  const booksById = new Map<string, ContentBook>(
    contentRepository
      .listBooks()
      .map((contentBook) => [contentBook.book.id as string, contentBook] as const),
  )

  return uniqueBookIds(bookIds).flatMap((bookId) => {
    const book = booksById.get(bookId)
    return book ? [book] : []
  })
}

export function listBookshelf(
  contentRepository: ContentRepository,
  bookShelfRepository: BookShelfRepository,
): readonly ContentBook[] {
  return resolveBooksByIds(contentRepository, bookShelfRepository.list())
}

export function listBookshelfFromBookIds(
  contentRepository: ContentRepository,
  bookIds: readonly string[],
): readonly ContentBook[] {
  return resolveBooksByIds(contentRepository, bookIds)
}

export function listRecentReading(
  contentRepository: ContentRepository,
  recentReadingRepository: RecentReadingRepository,
  readingStateRepository: ReadingStateRepository,
): readonly RecentReadingEntry[] {
  return listRecentReadingFromBookIds(
    contentRepository,
    recentReadingRepository.list(),
    readingStateRepository,
  )
}

export function listRecentReadingFromBookIds(
  contentRepository: ContentRepository,
  bookIds: readonly string[],
  readingStateRepository: ReadingStateRepository,
): readonly RecentReadingEntry[] {
  const books = resolveBooksByIds(contentRepository, bookIds)

  return books.map((book) => {
    const position = readingStateRepository.load(book.book.id)
    const chapter = position
      ? book.chapters.find((candidate) => candidate.id === position.chapterId)
      : undefined

    return {
      book,
      position,
      chapterTitle: chapter?.title,
    }
  })
}

export function addBookToBookshelf(
  contentRepository: ContentRepository,
  bookShelfRepository: BookShelfRepository,
  requestedBookId: string,
): boolean {
  if (!contentRepository.getBook(requestedBookId)) {
    return false
  }

  bookShelfRepository.add(requestedBookId)
  return true
}

export function removeBookFromBookshelf(
  bookShelfRepository: BookShelfRepository,
  requestedBookId: string,
): void {
  bookShelfRepository.remove(requestedBookId)
}

export function touchRecentReading(
  contentRepository: ContentRepository,
  recentReadingRepository: RecentReadingRepository,
  requestedBookId: string,
): boolean {
  if (!contentRepository.getBook(requestedBookId)) {
    return false
  }

  recentReadingRepository.touch(requestedBookId)
  return true
}
