import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import { decideChapterAccess } from '../../domain/access/chapterAccessPolicy'
import type { Chapter } from '../../domain/catalog/chapter'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
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
