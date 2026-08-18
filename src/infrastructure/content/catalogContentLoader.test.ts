import { describe, expect, it } from 'vitest'
import { CONTENT_BOOK_SCHEMA, ContentImportError } from './catalogContentContract'
import {
  loadCatalogContent,
  loadProductionCatalogContent,
} from './catalogContentLoader'
import tideArchiveFixture from './books/book-tide-archive.json'

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
  it('discovers exactly the thirteen real fixtures via eager glob, sorted by catalogSequence', () => {
    const { books, proseByChapterId } = loadProductionCatalogContent()

    expect(books.map((entry) => entry.book.id)).toEqual([
      'book-tide-city',
      'book-frost-immortal',
      'book-midnight-office',
      'book-plum-rain-letter',
      'book-ember-crown',
      'book-orbit-last-light',
      'book-legacy-book-1',
      'book-legacy-book-2',
      'book-legacy-book-3',
      'book-legacy-book-6',
      'book-legacy-book-4',
      'book-legacy-book-5',
      'book-tide-archive',
    ])
    expect(books[0].chapters.map((chapter) => chapter.sequence)).toEqual([
      3, 1, 2, 4, 5, 6, 7, 8,
    ])
    expect(proseByChapterId.size).toBe(128)
  })

  it('loads the complete owner-reviewed tide archive metadata and paragraphs', () => {
    const { books, proseByChapterId } = loadProductionCatalogContent()
    const entry = books.find(({ book }) => book.id === 'book-tide-archive')

    expect(tideArchiveFixture.catalogSequence).toBe(13)
    expect(entry?.book).toMatchObject({
      id: 'book-tide-archive',
      title: '潮汐檔案',
      authorName: 'InnovativeNovels AI',
      categoryLabel: '科幻懸疑',
    })
    expect(entry?.description).toBe(
      '臨海城的鐘塔在凌晨三點十七分同時停擺，氣象局員林澄循著失蹤哥哥的訊息進入舊港鐘樓，發現城市正被一座能記錄未來的潮汐裝置拖向時間線重合的覆滅危機。',
    )
    expect(entry?.chapters.map((chapter) => chapter.title)).toEqual([
      '沉入海底的鐘',
      '舊港的回聲',
      '第四點整',
      '退潮後的灰線',
      '第七口井',
      '第六章：追尋鐘聲',
      '第七章：聲音的真相',
      '第八章：沉降的機關',
      '第九章：黑點的啟示',
      '第十章：未止的鐘聲',
    ])
    expect(entry?.chapters.every((chapter) => chapter.access === 'READABLE')).toBe(true)
    expect(entry?.chapters.map((chapter) => chapter.id)).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
      'chapter-tide-archive-006',
      'chapter-tide-archive-007',
      'chapter-tide-archive-008',
      'chapter-tide-archive-009',
      'chapter-tide-archive-010',
    ])
    expect(entry?.chapters.map((chapter) => chapter.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ])
    expect(proseByChapterId.get('chapter-tide-archive-001')).toEqual(
      tideArchiveFixture.chapters[0].prose,
    )
    expect(proseByChapterId.get('chapter-tide-archive-002')).toEqual(
      tideArchiveFixture.chapters[1].prose,
    )
    expect(proseByChapterId.get('chapter-tide-archive-003')).toEqual(
      tideArchiveFixture.chapters[2].prose,
    )
  })
})
