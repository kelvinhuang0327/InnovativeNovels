import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ChapterBookmark } from '../../domain/reading/chapterBookmark'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import type { ChapterBookmarksRepository } from './chapterBookmarksRepository'
import {
  addChapterBookmark,
  describeChapterPosition,
  isChapterBookmarked,
  listChapterBookmarks,
  listContinueReading,
  listTableOfContents,
  removeChapterBookmark,
} from './readingUseCases'
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

class FakeBookmarksRepository implements ChapterBookmarksRepository {
  private items: ChapterBookmark[]

  constructor(initial: ChapterBookmark[] = []) {
    this.items = [...initial]
  }

  list(): readonly ChapterBookmark[] {
    return this.items
  }

  add(bookmark: ChapterBookmark): void {
    if (!this.items.some((b) => b.bookId === bookmark.bookId && b.chapterId === bookmark.chapterId)) {
      this.items.push(bookmark)
    }
  }

  remove(targetBookId: string, targetChapterId: string): void {
    this.items = this.items.filter(
      (b) => !(b.bookId === targetBookId && b.chapterId === targetChapterId),
    )
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

describe('Chapter Bookmarks Use Cases', () => {
  const bookA = makeBook('book-a', [
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
  ])
  const bookB = makeBook('book-b', [
    chapter('book-b', 'b-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-b', 'b-2', 2, CHAPTER_ACCESS.LOCKED),
  ])
  const repo = new FakeContentRepository([bookA, bookB])

  it('can bookmark accessible chapters and remove bookmarks', () => {
    const bookmarksRepo = new FakeBookmarksRepository()

    expect(addChapterBookmark(repo, bookmarksRepo, 'book-a', 'a-1')).toBe(true)
    expect(isChapterBookmarked(bookmarksRepo, 'book-a', 'a-1')).toBe(true)

    removeChapterBookmark(bookmarksRepo, 'book-a', 'a-1')
    expect(isChapterBookmarked(bookmarksRepo, 'book-a', 'a-1')).toBe(false)
  })

  it('prevents bookmarking locked chapters', () => {
    const bookmarksRepo = new FakeBookmarksRepository()

    expect(addChapterBookmark(repo, bookmarksRepo, 'book-b', 'b-2')).toBe(false)
    expect(isChapterBookmarked(bookmarksRepo, 'book-b', 'b-2')).toBe(false)
  })

  it('lists bookmarks in catalog and explicit chapter order', () => {
    const bookmarksRepo = new FakeBookmarksRepository([
      { bookId: bookId('book-b'), chapterId: chapterId('b-1') },
      { bookId: bookId('book-a'), chapterId: chapterId('a-2') },
      { bookId: bookId('book-a'), chapterId: chapterId('a-1') },
    ])

    const list = listChapterBookmarks(repo, bookmarksRepo)
    expect(list).toHaveLength(3)
    expect(list[0].book.book.id).toBe('book-a')
    expect(list[0].chapter.id).toBe('a-1')
    expect(list[1].book.book.id).toBe('book-a')
    expect(list[1].chapter.id).toBe('a-2')
    expect(list[2].book.book.id).toBe('book-b')
    expect(list[2].chapter.id).toBe('b-1')
  })

  it('ignores stale book and chapter IDs and locked bookmarks', () => {
    const bookmarksRepo = new FakeBookmarksRepository([
      { bookId: bookId('stale-book'), chapterId: chapterId('a-1') },
      { bookId: bookId('book-a'), chapterId: chapterId('stale-chapter') },
      { bookId: bookId('book-b'), chapterId: chapterId('b-2') }, // locked
    ])

    const list = listChapterBookmarks(repo, bookmarksRepo)
    expect(list).toEqual([])
  })
})

describe('listTableOfContents', () => {
  // Array order deliberately differs from explicit sequence order, mirroring
  // the real content fixtures, so tests can prove sequence (not array index)
  // drives the result.
  const book = makeBook('book-a', [
    chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.LOCKED),
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
  ])

  it('lists chapters in explicit sequence order, not array order', () => {
    const entries = listTableOfContents(book, 'a-1')
    expect(entries.map((entry) => entry.chapterId)).toEqual([
      'a-1',
      'a-2',
      'a-3',
    ])
  })

  it('retains exact ChapterId, title, and sequence for each entry', () => {
    const entries = listTableOfContents(book, undefined)
    expect(entries[0]).toEqual({
      chapterId: 'a-1',
      title: 'Chapter a-1',
      sequence: 1,
      isAccessible: true,
      isCurrent: false,
    })
  })

  it('marks the current chapter and no other', () => {
    const entries = listTableOfContents(book, 'a-2')
    expect(entries.map((entry) => entry.isCurrent)).toEqual([
      false,
      true,
      false,
    ])
  })

  it('marks locked chapters inaccessible while keeping them visible in the list', () => {
    const entries = listTableOfContents(book, 'a-1')
    expect(entries.map((entry) => entry.isAccessible)).toEqual([
      true,
      true,
      false,
    ])
    expect(entries).toHaveLength(3)
  })

  it('fails safely when the current chapter id does not resolve to any entry', () => {
    const entries = listTableOfContents(book, 'does-not-exist')
    expect(entries).toHaveLength(3)
    expect(entries.every((entry) => !entry.isCurrent)).toBe(true)
  })
})

describe('describeChapterPosition', () => {
  const book = makeBook('book-a', [
    chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.LOCKED),
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
  ])

  it('derives chapter position from explicit sequence order, counting locked chapters in the total', () => {
    expect(describeChapterPosition(book, 'a-1')).toEqual({
      currentPosition: 1,
      totalChapters: 3,
    })
    expect(describeChapterPosition(book, 'a-2')).toEqual({
      currentPosition: 2,
      totalChapters: 3,
    })
    expect(describeChapterPosition(book, 'a-3')).toEqual({
      currentPosition: 3,
      totalChapters: 3,
    })
  })

  it('returns undefined for an unresolved chapter id instead of fabricating a position', () => {
    expect(describeChapterPosition(book, 'does-not-exist')).toBeUndefined()
  })
})
