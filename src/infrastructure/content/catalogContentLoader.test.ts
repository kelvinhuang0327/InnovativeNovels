import { describe, expect, it } from 'vitest'
import { CONTENT_BOOK_SCHEMA, ContentImportError } from './catalogContentContract'
import {
  loadCatalogContent,
  loadProductionCatalogContent,
} from './catalogContentLoader'

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    schema: CONTENT_BOOK_SCHEMA,
    bookId: 'book-a',
    catalogSequence: 1,
    title: 'Title A',
    authorName: 'Author A',
    categoryLabel: 'Genre A',
    description: 'Description A',
    chapters: [
      {
        chapterId: 'a-chapter-one',
        sequence: 1,
        title: 'A Chapter One',
        access: 'READABLE',
        prose: ['A para one.', 'A para two.'],
      },
    ],
    ...overrides,
  }
}

describe('loadCatalogContent', () => {
  it('sorts the catalog by catalogSequence, never by module map order', () => {
    const modules = {
      './books/book-c.json': fixture({
        bookId: 'book-c',
        catalogSequence: 3,
        chapters: [
          {
            chapterId: 'c-chapter-one',
            sequence: 1,
            title: 'C1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
      './books/book-a.json': fixture({
        bookId: 'book-a',
        catalogSequence: 1,
      }),
      './books/book-b.json': fixture({
        bookId: 'book-b',
        catalogSequence: 2,
        chapters: [
          {
            chapterId: 'b-chapter-one',
            sequence: 1,
            title: 'B1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
    }

    const { books } = loadCatalogContent(modules)

    expect(books.map((entry) => entry.book.id)).toEqual([
      'book-a',
      'book-b',
      'book-c',
    ])
  })

  it('preserves each fixture-authored chapter array order without sorting', () => {
    const modules = {
      './books/book-a.json': fixture({
        chapters: [
          {
            chapterId: 'a-chapter-three',
            sequence: 3,
            title: 'A3',
            access: 'LOCKED',
          },
          {
            chapterId: 'a-chapter-one',
            sequence: 1,
            title: 'A1',
            access: 'READABLE',
            prose: ['p'],
          },
          {
            chapterId: 'a-chapter-two',
            sequence: 2,
            title: 'A2',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
    }

    const { books } = loadCatalogContent(modules)

    expect(books[0].chapters.map((chapter) => chapter.sequence)).toEqual([
      3, 1, 2,
    ])
  })

  it('builds a prose map containing only accessible chapters', () => {
    const modules = {
      './books/book-a.json': fixture({
        chapters: [
          {
            chapterId: 'a-chapter-one',
            sequence: 1,
            title: 'A1',
            access: 'READABLE',
            prose: ['visible one', 'visible two'],
          },
          {
            chapterId: 'a-chapter-two',
            sequence: 2,
            title: 'A2',
            access: 'LOCKED',
          },
        ],
      }),
    }

    const { proseByChapterId } = loadCatalogContent(modules)

    expect(proseByChapterId.get('a-chapter-one')).toEqual([
      'visible one',
      'visible two',
    ])
    expect(proseByChapterId.has('a-chapter-two')).toBe(false)
    expect(proseByChapterId.get('a-chapter-two')).toBeUndefined()
  })

  it('automatically discovers a fifth valid fixture with no code change', () => {
    const modules = {
      './books/book-a.json': fixture({ bookId: 'book-a', catalogSequence: 1 }),
      './books/book-b.json': fixture({
        bookId: 'book-b',
        catalogSequence: 2,
        chapters: [
          {
            chapterId: 'b-chapter-one',
            sequence: 1,
            title: 'B1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
      './books/book-c.json': fixture({
        bookId: 'book-c',
        catalogSequence: 3,
        chapters: [
          {
            chapterId: 'c-chapter-one',
            sequence: 1,
            title: 'C1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
      './books/book-d.json': fixture({
        bookId: 'book-d',
        catalogSequence: 4,
        chapters: [
          {
            chapterId: 'd-chapter-one',
            sequence: 1,
            title: 'D1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
      './books/book-e.json': fixture({
        bookId: 'book-e',
        catalogSequence: 5,
        chapters: [
          {
            chapterId: 'e-chapter-one',
            sequence: 1,
            title: 'E1',
            access: 'READABLE',
            prose: ['newly added fifth book'],
          },
        ],
      }),
    }

    const { books } = loadCatalogContent(modules)

    expect(books.map((entry) => entry.book.id)).toEqual([
      'book-a',
      'book-b',
      'book-c',
      'book-d',
      'book-e',
    ])
  })

  it('atomically rejects the whole catalog on a duplicate book id', () => {
    const modules = {
      './books/book-a.json': fixture({ bookId: 'book-a', catalogSequence: 1 }),
      './books/duplicate/book-a.json': fixture({
        bookId: 'book-a',
        catalogSequence: 2,
      }),
    }

    try {
      loadCatalogContent(modules)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ContentImportError)
      expect((error as ContentImportError).reason).toBe('DUPLICATE_BOOK_ID')
    }
  })

  it('atomically rejects the whole catalog on a duplicate catalogSequence', () => {
    const modules = {
      './books/book-a.json': fixture({ bookId: 'book-a', catalogSequence: 1 }),
      './books/book-b.json': fixture({
        bookId: 'book-b',
        catalogSequence: 1,
        chapters: [
          {
            chapterId: 'b-chapter-one',
            sequence: 1,
            title: 'B1',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
    }

    try {
      loadCatalogContent(modules)
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe(
        'DUPLICATE_CATALOG_SEQUENCE',
      )
    }
  })

  it('atomically rejects the whole catalog on a chapter id duplicated across books', () => {
    const modules = {
      './books/book-a.json': fixture({ bookId: 'book-a', catalogSequence: 1 }),
      './books/book-b.json': fixture({
        bookId: 'book-b',
        catalogSequence: 2,
        chapters: [
          {
            chapterId: 'a-chapter-one',
            sequence: 1,
            title: 'Collides with book-a',
            access: 'READABLE',
            prose: ['p'],
          },
        ],
      }),
    }

    try {
      loadCatalogContent(modules)
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('DUPLICATE_CHAPTER_ID')
    }
  })

  it('rejects the whole catalog when any single fixture is malformed', () => {
    const modules = {
      './books/book-a.json': fixture({ bookId: 'book-a', catalogSequence: 1 }),
      './books/book-b.json': fixture({
        bookId: 'book-b',
        catalogSequence: 2,
        schema: 'not-the-right-schema',
      }),
    }

    expect(() => loadCatalogContent(modules)).toThrow(ContentImportError)
  })
})

describe('loadProductionCatalogContent', () => {
  it('discovers exactly the seven real fixtures via eager glob, sorted by catalogSequence', () => {
    const { books, proseByChapterId } = loadProductionCatalogContent()

    expect(books.map((entry) => entry.book.id)).toEqual([
      'book-tide-city',
      'book-frost-immortal',
      'book-midnight-office',
      'book-plum-rain-letter',
      'book-ember-crown',
      'book-orbit-last-light',
      'book-legacy-book-1',
    ])
    expect(books[0].chapters.map((chapter) => chapter.sequence)).toEqual([
      3, 1, 2,
    ])
    expect(proseByChapterId.size).toBe(22)
  })
})
