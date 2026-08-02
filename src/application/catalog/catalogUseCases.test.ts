import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ContentBook } from './contentRepository'
import { filterCatalog, listGenres } from './catalogUseCases'

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
