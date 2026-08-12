import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import type { ReadingStateRepository } from '../reading/readingStateRepository'
import type { BookShelfRepository } from './bookShelfRepository'
import {
  addBookToBookshelf,
  listBookshelf,
  listRecentReading,
  removeBookFromBookshelf,
  touchRecentReading,
} from './libraryUseCases'
import type { RecentReadingRepository } from './recentReadingRepository'

function makeBook(id: string, title: string): ContentBook {
  const typedBookId = bookId(id)
  return {
    book: {
      id: typedBookId,
      title,
      authorName: '作者',
      categoryLabel: '分類',
    },
    description: '故事簡介',
    chapters: [
      {
        id: chapterId(`${id}-chapter-1`),
        bookId: typedBookId,
        title: `${title} 第一章`,
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
    ],
  }
}

class FakeContentRepository implements ContentRepository {
  private readonly books: readonly ContentBook[]

  constructor(books: readonly ContentBook[]) {
    this.books = books
  }

  listBooks(): readonly ContentBook[] {
    return this.books
  }

  getBook(requestedBookId: string): ContentBook | undefined {
    return this.books.find((book) => book.book.id === requestedBookId)
  }

  getChapterProse(): readonly string[] | undefined {
    return undefined
  }
}

class FakeBookShelfRepository implements BookShelfRepository {
  private bookIds: string[]

  constructor(bookIds: string[] = []) {
    this.bookIds = bookIds
  }

  list(): readonly string[] {
    return this.bookIds
  }

  contains(bookId: string): boolean {
    return this.bookIds.includes(bookId)
  }

  add(bookId: string): void {
    if (!this.bookIds.includes(bookId)) {
      this.bookIds = [...this.bookIds, bookId]
    }
  }

  remove(bookId: string): void {
    this.bookIds = this.bookIds.filter((candidate) => candidate !== bookId)
  }
}

class FakeRecentReadingRepository implements RecentReadingRepository {
  private readonly bookIds: readonly string[]

  constructor(bookIds: readonly string[]) {
    this.bookIds = bookIds
  }

  list(): readonly string[] {
    return this.bookIds
  }

  touch(): void {
    throw new Error('not needed for list tests')
  }
}

class FakeReadingStateRepository implements ReadingStateRepository {
  private readonly positions: readonly ReadingPosition[]

  constructor(positions: readonly ReadingPosition[]) {
    this.positions = positions
  }

  load(requestedBookId: string): ReadingPosition | undefined {
    return this.positions.find((position) => position.bookId === requestedBookId)
  }

  save(): void {
    throw new Error('not needed for list tests')
  }

  listSavedPositions(): readonly ReadingPosition[] {
    return this.positions
  }
}

const bookA = makeBook('book-a', '海邊書店')
const bookB = makeBook('book-b', '山中劍客')
const contentRepository = new FakeContentRepository([bookA, bookB])

describe('Bookshelf use cases', () => {
  it('resolves saved IDs in save order and omits stale IDs', () => {
    const repository = new FakeBookShelfRepository([
      'book-b',
      'book-stale',
      'book-a',
      'book-a',
    ])

    expect(
      listBookshelf(contentRepository, repository).map((book) => book.book.id),
    ).toEqual(['book-b', 'book-a'])
  })

  it('validates book IDs before adding and keeps removal independent', () => {
    const repository = new FakeBookShelfRepository()

    expect(addBookToBookshelf(contentRepository, repository, 'book-a')).toBe(true)
    expect(addBookToBookshelf(contentRepository, repository, 'book-stale')).toBe(
      false,
    )
    removeBookFromBookshelf(repository, 'book-a')

    expect(repository.list()).toEqual([])
  })
})

describe('Recent Reading use cases', () => {
  it('resolves genuine repository order and current chapter details', () => {
    const position: ReadingPosition = {
      bookId: bookId('book-a'),
      chapterId: chapterId('book-a-chapter-1'),
      paragraphIndex: 0,
      chapterProgress: 0.4,
    }
    const recentRepository = new FakeRecentReadingRepository([
      'book-b',
      'book-stale',
      'book-a',
    ])

    const entries = listRecentReading(
      contentRepository,
      recentRepository,
      new FakeReadingStateRepository([position]),
    )

    expect(entries.map((entry) => entry.book.book.id)).toEqual([
      'book-b',
      'book-a',
    ])
    expect(entries[1].chapterTitle).toBe('海邊書店 第一章')
    expect(entries[1].position).toEqual(position)
  })

  it('does not record stale books in recent history', () => {
    const touched: string[] = []
    const repository: RecentReadingRepository = {
      list: () => [],
      touch: (bookId) => touched.push(bookId),
    }

    expect(touchRecentReading(contentRepository, repository, 'book-stale')).toBe(
      false,
    )
    expect(touched).toEqual([])

    expect(touchRecentReading(contentRepository, repository, 'book-b')).toBe(true)
    expect(touched).toEqual(['book-b'])
  })
})
