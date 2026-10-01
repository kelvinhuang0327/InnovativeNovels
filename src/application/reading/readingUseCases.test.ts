import { describe, expect, it, vi } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ChapterBookmark } from '../../domain/reading/chapterBookmark'
import type { ChapterReadingNote } from '../../domain/reading/chapterReadingNote'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type {
  ContentBook,
  ContentRepository,
} from '../catalog/contentRepository'
import type { ChapterBookmarksRepository } from './chapterBookmarksRepository'
import type { ChapterReadingNotesRepository } from './chapterReadingNotesRepository'
import {
  addChapterBookmark,
  canNavigateToAdjacentChapter,
  describeChapterPosition,
  getChapterReadingNote,
  isChapterBookmarked,
  listChapterBookmarks,
  listChapterReadingNotes,
  listContinueReading,
  listTableOfContents,
  navigateToAdjacentChapter,
  openReadingChapter,
  recoverActiveReaderSession,
  removeChapterBookmark,
  removeChapterReadingNote,
  saveChapterReadingNote,
  updateReadingProgress,
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

  getChapterProse(requestedChapterId: string): readonly string[] | undefined {
    return this.books.some((book) =>
      book.chapters.some((chapter) => chapter.id === requestedChapterId),
    )
      ? ['test prose']
      : undefined
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

class MutableReadingStateRepository implements ReadingStateRepository {
  private positions: ReadingPosition[]

  constructor(initial: readonly ReadingPosition[] = []) {
    this.positions = [...initial]
  }

  load(requestedBookId: string): ReadingPosition | undefined {
    return this.positions.find((p) => p.bookId === requestedBookId)
  }

  save(position: ReadingPosition): void {
    this.positions = [
      ...this.positions.filter((p) => p.bookId !== position.bookId),
      position,
    ]
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

class FakeChapterReadingNotesRepository
  implements ChapterReadingNotesRepository
{
  private readonly notes = new Map<string, unknown>()

  list(): readonly ChapterReadingNote[] {
    return [...this.notes.values()] as readonly ChapterReadingNote[]
  }

  load(targetBookId: string, targetChapterId: string): ChapterReadingNote | undefined {
    return this.notes.get(
      JSON.stringify([targetBookId, targetChapterId]),
    ) as ChapterReadingNote | undefined
  }

  save(note: ChapterReadingNote): void {
    this.notes.set(JSON.stringify([note.bookId, note.chapterId]), note)
  }

  remove(targetBookId: string, targetChapterId: string): void {
    this.notes.delete(JSON.stringify([targetBookId, targetChapterId]))
  }

  addPersisted(value: unknown): void {
    this.notes.set(`malformed-${this.notes.size}`, value)
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

  it.each([
    ['paragraph index', { ...position('book-a', 'a-1'), paragraphIndex: 1 }],
    ['chapter progress', { ...position('book-a', 'a-1'), chapterProgress: 1.1 }],
  ] as const)('ignores a saved position with an invalid %s', (_, savedPosition) => {
    expect(
      listContinueReading(
        new FakeContentRepository(catalog),
        new FakeReadingStateRepository([savedPosition]),
      ),
    ).toEqual([])
  })

  it('ignores a saved position when its chapter prose is invalid', () => {
    const contentRepository = new FakeContentRepository(catalog)
    vi.spyOn(contentRepository, 'getChapterProse').mockReturnValue(['  '])

    expect(
      listContinueReading(
        contentRepository,
        new FakeReadingStateRepository([position('book-a', 'a-1')]),
      ),
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
    const savedPosition = {
      ...position('book-a', 'a-1'),
      chapterProgress: 0.42,
    }
    const readingStateRepo = new FakeReadingStateRepository([savedPosition])

    expect(
      addChapterBookmark(
        repo,
        readingStateRepo,
        bookmarksRepo,
        'book-a',
        'a-1',
      ),
    ).toBe(true)
    expect(isChapterBookmarked(bookmarksRepo, 'book-a', 'a-1')).toBe(true)
    expect(bookmarksRepo.list()).toEqual([savedPosition])

    removeChapterBookmark(bookmarksRepo, 'book-a', 'a-1')
    expect(isChapterBookmarked(bookmarksRepo, 'book-a', 'a-1')).toBe(false)
  })

  it('prevents bookmarking locked chapters', () => {
    const bookmarksRepo = new FakeBookmarksRepository()

    expect(
      addChapterBookmark(
        repo,
        new FakeReadingStateRepository([]),
        bookmarksRepo,
        'book-b',
        'b-2',
      ),
    ).toBe(false)
    expect(isChapterBookmarked(bookmarksRepo, 'book-b', 'b-2')).toBe(false)
  })

  it('lists bookmarks in catalog and explicit chapter order', () => {
    const bookmarksRepo = new FakeBookmarksRepository([
      position('book-b', 'b-1'),
      position('book-a', 'a-2'),
      position('book-a', 'a-1'),
    ])

    const list = listChapterBookmarks(repo, bookmarksRepo)
    expect(list).toHaveLength(3)
    expect(list[0].book.book.id).toBe('book-a')
    expect(list[0].chapter.id).toBe('a-1')
    expect(list[0].position).toEqual(position('book-a', 'a-1'))
    expect(list[1].book.book.id).toBe('book-a')
    expect(list[1].chapter.id).toBe('a-2')
    expect(list[2].book.book.id).toBe('book-b')
    expect(list[2].chapter.id).toBe('b-1')
  })

  it('ignores stale book and chapter IDs and locked bookmarks', () => {
    const bookmarksRepo = new FakeBookmarksRepository([
      position('stale-book', 'a-1'),
      position('book-a', 'stale-chapter'),
      position('book-b', 'b-2'), // locked
    ])

    const list = listChapterBookmarks(repo, bookmarksRepo)
    expect(list).toEqual([])
  })
})

describe('chapter reading notes', () => {
  it('keeps notes independent by book and chapter and preserves plain text', () => {
    const repository = new FakeChapterReadingNotesRepository()

    saveChapterReadingNote(repository, 'book-a', 'chapter-1', 'first\nline')
    saveChapterReadingNote(repository, 'book-a', 'chapter-2', 'second chapter')
    saveChapterReadingNote(repository, 'book-b', 'chapter-1', 'other book')

    expect(getChapterReadingNote(repository, 'book-a', 'chapter-1')?.content).toBe(
      'first\nline',
    )
    expect(getChapterReadingNote(repository, 'book-a', 'chapter-2')?.content).toBe(
      'second chapter',
    )
    expect(getChapterReadingNote(repository, 'book-b', 'chapter-1')?.content).toBe(
      'other book',
    )

    removeChapterReadingNote(repository, 'book-a', 'chapter-1')
    expect(getChapterReadingNote(repository, 'book-a', 'chapter-1')).toBeUndefined()
    expect(getChapterReadingNote(repository, 'book-a', 'chapter-2')?.content).toBe(
      'second chapter',
    )
    expect(getChapterReadingNote(repository, 'book-b', 'chapter-1')?.content).toBe(
      'other book',
    )
  })

  it('treats whitespace-only content as clearing the current chapter note', () => {
    const repository = new FakeChapterReadingNotesRepository()
    saveChapterReadingNote(repository, 'book-a', 'chapter-1', 'saved note')
    saveChapterReadingNote(repository, 'book-a', 'chapter-2', 'keep this note')

    saveChapterReadingNote(repository, 'book-a', 'chapter-1', ' \n  ')

    expect(getChapterReadingNote(repository, 'book-a', 'chapter-1')).toBeUndefined()
    expect(getChapterReadingNote(repository, 'book-a', 'chapter-2')?.content).toBe(
      'keep this note',
    )
  })

  it('lists notes in content-book and canonical chapter order, including books outside the shelf', () => {
    const firstBook = makeBook('book-a', [
      chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.READABLE),
      chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.PREVIEW),
      chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    ])
    const secondBook = makeBook('book-b', [
      chapter('book-b', 'b-1', 1, CHAPTER_ACCESS.READABLE),
    ])
    const contentRepository = new FakeContentRepository([firstBook, secondBook])
    const notesRepository = new FakeChapterReadingNotesRepository()

    saveChapterReadingNote(notesRepository, 'book-b', 'b-1', '最後一書')
    saveChapterReadingNote(notesRepository, 'book-a', 'a-3', '第三章')
    saveChapterReadingNote(notesRepository, 'book-a', 'a-2', '第二章')
    saveChapterReadingNote(notesRepository, 'book-a', 'a-1', '第一章')

    const entries = listChapterReadingNotes(contentRepository, notesRepository)

    expect(
      entries.map(({ book, chapter, note }) => [
        book.book.id,
        chapter.id,
        note.content,
      ]),
    ).toEqual([
      ['book-a', 'a-1', '第一章'],
      ['book-a', 'a-2', '第二章'],
      ['book-a', 'a-3', '第三章'],
      ['book-b', 'b-1', '最後一書'],
    ])
  })

  it('ignores locked, unavailable, orphaned, and malformed notes without throwing', () => {
    const book = makeBook('book-a', [
      chapter('book-a', 'a-readable', 1, CHAPTER_ACCESS.READABLE),
      chapter('book-a', 'a-locked', 2, CHAPTER_ACCESS.LOCKED),
      chapter('book-a', 'a-unavailable', 3, CHAPTER_ACCESS.UNAVAILABLE),
    ])
    const notesRepository = new FakeChapterReadingNotesRepository()
    const validNote: ChapterReadingNote = {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-readable'),
      content: '可讀筆記',
    }

    notesRepository.addPersisted(validNote)
    notesRepository.addPersisted({
      bookId: 'book-a',
      chapterId: 'a-locked',
      content: '鎖定筆記',
    })
    notesRepository.addPersisted({
      bookId: 'book-a',
      chapterId: 'a-unavailable',
      content: '暫不可用筆記',
    })
    notesRepository.addPersisted({
      bookId: 'book-a',
      chapterId: 'missing-chapter',
      content: '孤立筆記',
    })
    notesRepository.addPersisted({ bookId: 'book-a', chapterId: 'a-readable', content: ' \n ' })
    notesRepository.addPersisted({ bookId: 5, chapterId: 'a-readable', content: 'bad id' })
    notesRepository.addPersisted(null)

    expect(
      listChapterReadingNotes(
        new FakeContentRepository([book]),
        notesRepository,
      ).map((entry) => entry.note),
    ).toEqual([validNote])
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

describe('recoverActiveReaderSession', () => {
  const bookA = makeBook('book-a', [
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.LOCKED),
  ])
  const lockedOnlyBook = makeBook('book-locked', [
    chapter('book-locked', 'locked-1', 1, CHAPTER_ACCESS.LOCKED),
  ])
  const catalog = [bookA, lockedOnlyBook]

  it('reopens the exact saved chapter for a valid active BookId', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const readingStateRepository = new MutableReadingStateRepository([
      position('book-a', 'a-2'),
    ])

    const opened = recoverActiveReaderSession(
      contentRepository,
      readingStateRepository,
      'book-a',
    )

    expect(opened?.chapter.id).toBe('a-2')
    expect(opened?.book.book.id).toBe('book-a')
  })

  it('returns undefined for an unknown active BookId', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const readingStateRepository = new MutableReadingStateRepository()

    expect(
      recoverActiveReaderSession(
        contentRepository,
        readingStateRepository,
        'book-unknown',
      ),
    ).toBeUndefined()
  })

  it('falls back to the first readable chapter when no ReadingPosition is saved yet', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const readingStateRepository = new MutableReadingStateRepository()

    const opened = recoverActiveReaderSession(
      contentRepository,
      readingStateRepository,
      'book-a',
    )

    expect(opened?.chapter.id).toBe('a-1')
  })

  it('falls back to the first readable chapter when the saved chapter id is stale', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const readingStateRepository = new MutableReadingStateRepository([
      position('book-a', 'a-removed'),
    ])

    const opened = recoverActiveReaderSession(
      contentRepository,
      readingStateRepository,
      'book-a',
    )

    expect(opened?.chapter.id).toBe('a-1')
  })

  it('falls back to the first readable chapter when the saved chapter is now locked, and never requests locked prose', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')
    const readingStateRepository = new MutableReadingStateRepository([
      position('book-a', 'a-3'),
    ])

    const opened = recoverActiveReaderSession(
      contentRepository,
      readingStateRepository,
      'book-a',
    )

    expect(opened?.chapter.id).toBe('a-1')
    expect(proseRequest).not.toHaveBeenCalledWith('a-3')
  })

  it('returns undefined when the active book has no accessible chapter, and requests no prose', () => {
    const contentRepository = new FakeContentRepository(catalog)
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')
    const readingStateRepository = new MutableReadingStateRepository()

    expect(
      recoverActiveReaderSession(
        contentRepository,
        readingStateRepository,
        'book-locked',
      ),
    ).toBeUndefined()
    expect(proseRequest).not.toHaveBeenCalled()
  })
})

describe('openReadingChapter missing prose fallback', () => {
  const book = makeBook('book-a', [
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
  ])

  it.each([
    ['missing', undefined],
    ['empty', []],
  ] as const)('does not open or overwrite state when prose is %s', (_, prose) => {
    const contentRepository: ContentRepository = {
      listBooks: () => [book],
      getBook: (requestedBookId) =>
        requestedBookId === 'book-a' ? book : undefined,
      getChapterProse: () => prose,
    }
    const existingPosition = {
      ...position('book-a', 'a-1'),
      chapterProgress: 0.66,
    }
    const readingStateRepository = new MutableReadingStateRepository([
      existingPosition,
    ])

    expect(
      openReadingChapter(contentRepository, readingStateRepository, {
        bookId: bookId('book-a'),
        chapterId: chapterId('a-1'),
        paragraphIndex: 0,
        chapterProgress: 0.42,
      }),
    ).toBeUndefined()
    expect(readingStateRepository.load('book-a')).toEqual(existingPosition)
  })
})

describe('openReadingChapter chapter-progress restore', () => {
  const bookA = makeBook('book-a', [
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.LOCKED),
  ])
  const contentRepository = new FakeContentRepository([bookA])

  it('carries the saved chapterProgress through to initialChapterProgress and preserves it in the writer', () => {
    const readingStateRepository = new MutableReadingStateRepository()

    const opened = openReadingChapter(contentRepository, readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-2'),
      paragraphIndex: 0,
      chapterProgress: 0.42,
    })

    expect(opened?.initialChapterProgress).toBe(0.42)
    expect(readingStateRepository.load('book-a')).toEqual({
      bookId: 'book-a',
      chapterId: 'a-2',
      paragraphIndex: 0,
      chapterProgress: 0.42,
    })
  })

  it.each([
    ['paragraph index', { ...position('book-a', 'a-2'), paragraphIndex: 1 }],
    ['chapter progress', { ...position('book-a', 'a-2'), chapterProgress: 1.1 }],
  ] as const)('rejects an invalid bookmarked %s without replacing current state', (_, invalidPosition) => {
    const existingPosition = {
      ...position('book-a', 'a-1'),
      chapterProgress: 0.66,
    }
    const readingStateRepository = new MutableReadingStateRepository([
      existingPosition,
    ])

    expect(
      openReadingChapter(
        contentRepository,
        readingStateRepository,
        invalidPosition,
      ),
    ).toBeUndefined()
    expect(readingStateRepository.load('book-a')).toEqual(existingPosition)
  })

  it('does not restore progress or request prose for a locked chapter', () => {
    const readingStateRepository = new MutableReadingStateRepository()
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')

    const opened = openReadingChapter(contentRepository, readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-3'),
      paragraphIndex: 0,
      chapterProgress: 0.9,
    })

    expect(opened?.isLocked).toBe(true)
    expect(opened?.initialChapterProgress).toBe(0)
    expect(proseRequest).not.toHaveBeenCalled()
    expect(readingStateRepository.load('book-a')).toBeUndefined()
  })

  it('starts a freshly navigated adjacent chapter at its own default progress, never inheriting the current chapter', () => {
    const readingStateRepository = new MutableReadingStateRepository([
      position('book-a', 'a-1'),
    ])
    const current = openReadingChapter(contentRepository, readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-1'),
      paragraphIndex: 0,
      chapterProgress: 0.8,
    })

    const next = navigateToAdjacentChapter(
      contentRepository,
      readingStateRepository,
      current as NonNullable<typeof current>,
      1,
    )

    expect(next?.chapter.id).toBe('a-2')
    expect(next?.initialChapterProgress).toBe(0)
  })

  it('reports adjacent navigation as available only when chapter access permits opening it', () => {
    const readingStateRepository = new MutableReadingStateRepository()
    const first = openReadingChapter(contentRepository, readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-1'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })
    const second = openReadingChapter(contentRepository, readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-2'),
      paragraphIndex: 0,
      chapterProgress: 0,
    })

    expect(
      canNavigateToAdjacentChapter(
        first as NonNullable<typeof first>,
        1,
      ),
    ).toBe(true)
    expect(
      canNavigateToAdjacentChapter(
        second as NonNullable<typeof second>,
        1,
      ),
    ).toBe(false)
    expect(
      canNavigateToAdjacentChapter(
        first as NonNullable<typeof first>,
        -1,
      ),
    ).toBe(false)
  })
})

describe('cross-chapter navigation correctness', () => {
  const bookA = makeBook('book-a', [
    chapter('book-a', 'a-3', 3, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-1', 1, CHAPTER_ACCESS.READABLE),
    chapter('book-a', 'a-2', 2, CHAPTER_ACCESS.READABLE),
  ])
  const bookB = makeBook('book-b', [
    chapter('book-b', 'b-1', 1, CHAPTER_ACCESS.READABLE),
  ])

  it.each([
    ['missing', undefined],
    ['empty array', []],
    ['empty paragraph', ['']],
    ['blank paragraph', [' \n\t ']],
    ['invalid paragraph after valid prose', ['valid prose', '']],
    ['non-string paragraph', [null] as unknown as readonly string[]],
    ['non-array prose', 'invalid prose' as unknown as readonly string[]],
  ] as const)(
    'preserves the current position in both directions for %s',
    (_, prose) => {
      const contentRepository = new FakeContentRepository([bookA, bookB])
      const otherPosition = { ...position('book-b', 'b-1'), chapterProgress: 0.73 }
      const readingStateRepository = new MutableReadingStateRepository([
        otherPosition,
      ])
      const currentPosition = { ...position('book-a', 'a-2'), chapterProgress: 0.66 }
      const current = openReadingChapter(
        contentRepository,
        readingStateRepository,
        currentPosition,
      )!
      const savedPositions = readingStateRepository.listSavedPositions()
      const save = vi.spyOn(readingStateRepository, 'save')
      const loadProse = vi
        .spyOn(contentRepository, 'getChapterProse')
        .mockReturnValue(prose)

      for (const direction of [-1, 1] as const) {
        expect(
          navigateToAdjacentChapter(
            contentRepository,
            readingStateRepository,
            current,
            direction,
          ),
        ).toBeUndefined()
        expect(loadProse).toHaveBeenLastCalledWith(direction === -1 ? 'a-1' : 'a-3')
        expect(save).not.toHaveBeenCalled()
        expect(readingStateRepository.listSavedPositions()).toEqual(savedPositions)
        expect(current.chapter.id).toBe('a-2')
        expect(current.prose).toEqual(['test prose'])
      }
    },
  )

  it.each([
    ['a-1', -1],
    ['a-3', 1],
  ] as const)('preserves %s at its outer boundary', (currentId, direction) => {
    const contentRepository = new FakeContentRepository([bookA, bookB])
    const readingStateRepository = new MutableReadingStateRepository()
    const saved = { ...position('book-a', currentId), chapterProgress: 0.66 }
    const current = openReadingChapter(contentRepository, readingStateRepository, saved)!
    const save = vi.spyOn(readingStateRepository, 'save')
    const loadProse = vi.spyOn(contentRepository, 'getChapterProse')

    expect(canNavigateToAdjacentChapter(current, direction)).toBe(false)
    expect(
      navigateToAdjacentChapter(contentRepository, readingStateRepository, current, direction),
    ).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    expect(loadProse).not.toHaveBeenCalled()
    expect(readingStateRepository.load('book-a')).toEqual(saved)
  })

  it('rejects a target chapter belonging to another book before loading or saving it', () => {
    const contentRepository = new FakeContentRepository([bookA, bookB])
    const saved = { ...position('book-a', 'a-2'), chapterProgress: 0.66 }
    const readingStateRepository = new MutableReadingStateRepository([saved])
    const save = vi.spyOn(readingStateRepository, 'save')
    const loadProse = vi.spyOn(contentRepository, 'getChapterProse')

    expect(
      openReadingChapter(contentRepository, readingStateRepository, position('book-a', 'b-1')),
    ).toBeUndefined()
    expect(save).not.toHaveBeenCalled()
    expect(loadProse).not.toHaveBeenCalled()
    expect(readingStateRepository.listSavedPositions()).toEqual([saved])
  })
})

describe('updateReadingProgress', () => {
  it('forwards the position to the ReadingStateRepository writer', () => {
    const readingStateRepository = new MutableReadingStateRepository()

    updateReadingProgress(readingStateRepository, {
      bookId: bookId('book-a'),
      chapterId: chapterId('a-1'),
      paragraphIndex: 0,
      chapterProgress: 0.66,
    })

    expect(readingStateRepository.load('book-a')).toEqual({
      bookId: 'book-a',
      chapterId: 'a-1',
      paragraphIndex: 0,
      chapterProgress: 0.66,
    })
  })
})
