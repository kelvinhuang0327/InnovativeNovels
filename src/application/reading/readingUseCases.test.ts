import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import { listContinueReading } from './readingUseCases'
import type { ReadingStateRepository } from './readingStateRepository'

function chapter(
  bookIdValue: string,
  id: string,
  sequence: number,
  access: Chapter['access'],
): Chapter {
  return {
    id: chapterId(id),
    bookId: bookId(bookIdValue),
    title: `Chapter ${id}`,
    sequence: chapterSequence(sequence),
    access,
  }
}

function makeBook(id: string, chapters: readonly Chapter[]): ContentBook {
  return {
    book: { id: bookId(id), title: `Title ${id}`, authorName: 'Author', categoryLabel: 'Genre' },
    description: 'Description',
    chapters,
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
    return this.books.find((entry) => entry.book.id === requestedBookId)
  }

  getChapterProse(): readonly string[] | undefined {
    return undefined
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
    throw new Error('not needed for this test double')
  }

  listSavedPositions(): readonly ReadingPosition[] {
    return this.positions
  }
}

function position(bookIdValue: string, chapterIdValue: string): ReadingPosition {
  return {
    bookId: bookId(bookIdValue),
    chapterId: chapterId(chapterIdValue),
    paragraphIndex: 0,
    chapterProgress: 0,
  }
}

describe('listContinueReading', () => {
  const bookA = makeBook('book-a', [
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
  ])
  const bookB = makeBook('book-b', [
    chapter('book-b', 'b-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-b', 'b-2', 2, CHAPTER_ACCESS.LOCKED),
  ])
  const catalog = [bookA, bookB]

  it('lists saved books in catalog order with their saved chapter', () => {
    const readingStateRepository = new FakeReadingStateRepository([
      position('book-b', 'b-1'),
      position('book-a', 'a-2'),
    ])

    const result = listContinueReading(
      new FakeContentRepository(catalog),
      readingStateRepository,
    )

    expect(result.map((entry) => entry.book.book.id)).toEqual([
      'book-a',
      'book-b',
    ])
    expect(result[0].chapter.id).toBe('a-2')
    expect(result[1].chapter.id).toBe('b-1')
  })

  it('ignores a saved position for an unknown Book ID', () => {
    const readingStateRepository = new FakeReadingStateRepository([
      position('book-unknown', 'x-1'),
    ])

    expect(
      listContinueReading(new FakeContentRepository(catalog), readingStateRepository),
    ).toEqual([])
  })

  it('ignores a saved position for an unknown Chapter ID', () => {
    const readingStateRepository = new FakeReadingStateRepository([
      position('book-a', 'does-not-exist'),
    ])

    expect(
      listContinueReading(new FakeContentRepository(catalog), readingStateRepository),
    ).toEqual([])
  })

  it('ignores a saved position for a chapter that is no longer accessible', () => {
    const readingStateRepository = new FakeReadingStateRepository([
      position('book-b', 'b-2'),
    ])

    expect(
      listContinueReading(new FakeContentRepository(catalog), readingStateRepository),
    ).toEqual([])
  })

  it('returns nothing when no positions are saved', () => {
    const readingStateRepository = new FakeReadingStateRepository([])

    expect(
      listContinueReading(new FakeContentRepository(catalog), readingStateRepository),
    ).toEqual([])
  })
})
