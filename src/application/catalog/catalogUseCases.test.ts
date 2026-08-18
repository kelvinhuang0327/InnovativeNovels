import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ContentBook } from './contentRepository'
import {
  filterCatalog,
  formatBookDetailDepthSummary,
  formatCatalogDepthLabel,
  getReadingDepth,
  listGenres,
} from './catalogUseCases'

function makeBook(
  id: string,
  title: string,
  categoryLabel: string,
  description: string,
  authorName = '作者',
): ContentBook {
  return {
    book: { id: bookId(id), title, authorName, categoryLabel },
    description,
    chapters: [
      {
        id: chapterId(`${id}-c1`),
        bookId: bookId(id),
        title: '第一章',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
    ],
  }
}

const books: readonly ContentBook[] = [
  makeBook('book-a', '海邊書店', '懸疑', '一間書店裡的秘密。', '沈墨'),
  makeBook('book-b', '山中劍客', '仙俠', '劍與修行的故事。', '岑海'),
  makeBook('book-c', '城市夜歸人', '都市', '深夜的都市故事。', '林晚'),
  makeBook('book-d', '雨中告白', '言情', '一段遲來的告白。', 'Wendy Lai'),
  makeBook('book-b2', '海上劍歌', '仙俠', '另一段劍與修行的故事。', '柳硯'),
]

describe('listGenres', () => {
  it('returns each represented genre once, in catalog order', () => {
    expect(listGenres(books)).toEqual(['懸疑', '仙俠', '都市', '言情'])
  })

  it('returns an empty list for an empty catalog', () => {
    expect(listGenres([])).toEqual([])
  })
})

describe('filterCatalog', () => {
  it('returns every book when no query or genre is set', () => {
    expect(filterCatalog(books, {})).toHaveLength(5)
  })

  it('matches by title', () => {
    const result = filterCatalog(books, { searchText: '劍客' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-b'])
  })

  it('matches by description', () => {
    const result = filterCatalog(books, { searchText: '告白' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-d'])
  })

  it('matches by author', () => {
    const result = filterCatalog(books, { searchText: '岑海' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-b'])
  })

  it('matches Latin author names case-insensitively', () => {
    const result = filterCatalog(books, { searchText: 'wendy' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-d'])
  })

  it('trims surrounding whitespace before matching', () => {
    const result = filterCatalog(books, { searchText: '  劍客  ' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-b'])
  })

  it('filters by genre', () => {
    const result = filterCatalog(books, { genre: '都市' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-c'])
  })

  it('combines search and genre by intersection', () => {
    expect(
      filterCatalog(books, { searchText: '劍客', genre: '都市' }),
    ).toHaveLength(0)
    expect(
      filterCatalog(books, { searchText: '劍客', genre: '仙俠' }),
    ).toHaveLength(1)
  })

  it('treats a blank search as no filter and restores every book', () => {
    expect(filterCatalog(books, { searchText: '   ' })).toHaveLength(5)
  })

  it('preserves the original catalog order among matching results', () => {
    const result = filterCatalog(books, { genre: '仙俠' })
    expect(result.map((entry) => entry.book.id)).toEqual(['book-b', 'book-b2'])
  })
})

describe('getReadingDepth', () => {
  it('Case A — all openable: total = N, openable = N, continuous = N, allOpenable = true', () => {
    const testBook: ContentBook = {
      book: {
        id: bookId('test-book-a'),
        title: '潮汐檔案',
        authorName: '沈墨',
        categoryLabel: '懸疑',
      },
      description: '全本可讀',
      chapters: [
        {
          id: chapterId('c1'),
          bookId: bookId('test-book-a'),
          title: '第一章',
          sequence: chapterSequence(1),
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c2'),
          bookId: bookId('test-book-a'),
          title: '第二章',
          sequence: chapterSequence(2),
          access: CHAPTER_ACCESS.PREVIEW,
        },
        {
          id: chapterId('c3'),
          bookId: bookId('test-book-a'),
          title: '第三章',
          sequence: chapterSequence(3),
          access: CHAPTER_ACCESS.READABLE,
        },
      ],
    }

    const depth = getReadingDepth(testBook)
    expect(depth).toEqual({
      totalChapters: 3,
      openableChapters: 3,
      continuousOpenableChapters: 3,
      allOpenable: true,
    })
  })

  it('Case B — contiguous partial: openable < total, continuous prefix matches openable', () => {
    const testBook: ContentBook = {
      book: {
        id: bookId('test-book-b'),
        title: '部分可讀之書',
        authorName: '作者',
        categoryLabel: '仙俠',
      },
      description: '前三章可讀',
      chapters: [
        {
          id: chapterId('c1'),
          bookId: bookId('test-book-b'),
          title: '第一章',
          sequence: chapterSequence(1),
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c2'),
          bookId: bookId('test-book-b'),
          title: '第二章',
          sequence: chapterSequence(2),
          access: CHAPTER_ACCESS.PREVIEW,
        },
        {
          id: chapterId('c3'),
          bookId: bookId('test-book-b'),
          title: '第三章',
          sequence: chapterSequence(3),
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c4'),
          bookId: bookId('test-book-b'),
          title: '第四章',
          sequence: chapterSequence(4),
          access: CHAPTER_ACCESS.LOCKED,
        },
        {
          id: chapterId('c5'),
          bookId: bookId('test-book-b'),
          title: '第五章',
          sequence: chapterSequence(5),
          access: CHAPTER_ACCESS.UNAVAILABLE,
        },
      ],
    }

    const depth = getReadingDepth(testBook)
    expect(depth).toEqual({
      totalChapters: 5,
      openableChapters: 3,
      continuousOpenableChapters: 3,
      allOpenable: false,
    })
  })

  it('Case C — accessibility gap: openable exceeds continuous prefix, allOpenable = false', () => {
    const testBook: ContentBook = {
      book: {
        id: bookId('test-book-c'),
        title: '跳章解鎖之書',
        authorName: '作者',
        categoryLabel: '都市',
      },
      description: '第三章鎖定但第四章開放',
      chapters: [
        {
          id: chapterId('c1'),
          bookId: bookId('test-book-c'),
          title: '第一章',
          sequence: chapterSequence(1),
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c2'),
          bookId: bookId('test-book-c'),
          title: '第二章',
          sequence: chapterSequence(2),
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c3'),
          bookId: bookId('test-book-c'),
          title: '第三章',
          sequence: chapterSequence(3),
          access: CHAPTER_ACCESS.LOCKED,
        },
        {
          id: chapterId('c4'),
          bookId: bookId('test-book-c'),
          title: '第四章',
          sequence: chapterSequence(4),
          access: CHAPTER_ACCESS.READABLE,
        },
      ],
    }

    const depth = getReadingDepth(testBook)
    expect(depth).toEqual({
      totalChapters: 4,
      openableChapters: 3,
      continuousOpenableChapters: 2,
      allOpenable: false,
    })
  })

  it('sorts chapters by sequence before calculating continuous prefix', () => {
    const chapters = [
      {
        id: chapterId('c3'),
        bookId: bookId('test'),
        title: '第三章',
        sequence: chapterSequence(3),
        access: CHAPTER_ACCESS.LOCKED,
      },
      {
        id: chapterId('c1'),
        bookId: bookId('test'),
        title: '第一章',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
      {
        id: chapterId('c2'),
        bookId: bookId('test'),
        title: '第二章',
        sequence: chapterSequence(2),
        access: CHAPTER_ACCESS.READABLE,
      },
    ]

    const depth = getReadingDepth(chapters)
    expect(depth).toEqual({
      totalChapters: 3,
      openableChapters: 2,
      continuousOpenableChapters: 2,
      allOpenable: false,
    })
  })

  it('handles empty chapters gracefully', () => {
    const depth = getReadingDepth([])
    expect(depth).toEqual({
      totalChapters: 0,
      openableChapters: 0,
      continuousOpenableChapters: 0,
      allOpenable: true,
    })
  })
})

describe('formatCatalogDepthLabel', () => {
  it('formats fully openable books as "N 章可讀"', () => {
    expect(
      formatCatalogDepthLabel({
        totalChapters: 10,
        openableChapters: 10,
        continuousOpenableChapters: 10,
        allOpenable: true,
      }),
    ).toBe('10 章可讀')
  })

  it('formats partial access books as "可讀 M / N 章"', () => {
    expect(
      formatCatalogDepthLabel({
        totalChapters: 5,
        openableChapters: 3,
        continuousOpenableChapters: 2,
        allOpenable: false,
      }),
    ).toBe('可讀 3 / 5 章')
  })
})

describe('formatBookDetailDepthSummary', () => {
  it('formats all-openable book as "目前 N 章皆可閱讀"', () => {
    expect(
      formatBookDetailDepthSummary({
        totalChapters: 10,
        openableChapters: 10,
        continuousOpenableChapters: 10,
        allOpenable: true,
      }),
    ).toBe('目前 10 章皆可閱讀')
  })

  it('formats contiguous partial book as "目前可連續閱讀前 N 章"', () => {
    expect(
      formatBookDetailDepthSummary({
        totalChapters: 5,
        openableChapters: 3,
        continuousOpenableChapters: 3,
        allOpenable: false,
      }),
    ).toBe('目前可連續閱讀前 3 章')
  })

  it('formats accessibility gap case as "目前有 N 章可閱讀" without false continuous claim', () => {
    expect(
      formatBookDetailDepthSummary({
        totalChapters: 4,
        openableChapters: 3,
        continuousOpenableChapters: 2,
        allOpenable: false,
      }),
    ).toBe('目前有 3 章可閱讀')
  })
})
