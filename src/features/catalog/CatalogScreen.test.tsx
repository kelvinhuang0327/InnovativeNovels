import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHAPTER_ACCESS,
  type ChapterAccess,
} from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { CatalogScreen } from './CatalogScreen'

function makeBook(
  id: string,
  title: string,
  categoryLabel: string,
  description: string,
  authorName = '作者',
  chapterCount = 1,
): ContentBook {
  const bookIdentifier = bookId(id)

  return {
    book: { id: bookIdentifier, title, authorName, categoryLabel },
    description,
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      id: chapterId(`${id}-c${index + 1}`),
      bookId: bookIdentifier,
      title: index === 0 ? '第一章' : `第${index + 1}章`,
      sequence: chapterSequence(index + 1),
      access: CHAPTER_ACCESS.READABLE,
    })),
  }
}

const books: readonly ContentBook[] = [
  makeBook('book-a', '海邊書店', '懸疑', '一間書店裡的秘密。', '沈墨'),
  makeBook('book-b', '山中劍客', '仙俠', '劍與修行的故事。', '岑海'),
  makeBook('book-c', '城市夜歸人', '都市', '深夜的都市告白故事。', '林晚'),
  makeBook('book-d', '雨中告白', '言情', '一段遲來的告白。', 'Wendy Lai'),
]

const sortingBooks: readonly ContentBook[] = [
  makeBook('sort-a', '來源第一本', '懸疑', '排序測試 A', '作者甲', 3),
  makeBook('sort-b', '來源第二本', '仙俠', '排序測試 B', '作者乙', 1),
  makeBook('sort-c', '來源第三本', '懸疑', '排序測試 C', '作者丙', 3),
  makeBook('sort-d', '來源第四本', '仙俠', '排序測試 D', '作者丁', 2),
]

const metadataSortingBooks: readonly ContentBook[] = [
  makeBook('metadata-zulu', 'Zulu', '懸疑', '排序測試 Zulu', 'Wendy'),
  makeBook('metadata-alpha', 'Alpha', '懸疑', '排序測試 Alpha', 'Bao'),
  makeBook('metadata-echo', 'Echo', '懸疑', '排序測試 Echo', 'Ann'),
  makeBook('metadata-bravo', 'Bravo', '懸疑', '排序測試 Bravo', 'Wendy'),
]

function withChapterAccesses(
  book: ContentBook,
  accesses: readonly ChapterAccess[],
): ContentBook {
  return {
    ...book,
    chapters: book.chapters.map((chapter, index) => ({
      ...chapter,
      access: accesses[index],
    })),
  }
}

const readabilitySortingBooks: readonly ContentBook[] = [
  withChapterAccesses(
    makeBook('readability-high', '可讀三章', '懸疑', '可讀排序樣本', '作者', 4),
    [
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.LOCKED,
    ],
  ),
  withChapterAccesses(
    makeBook('readability-tie-first', '可讀兩章先', '懸疑', '可讀排序樣本', '作者', 3),
    [CHAPTER_ACCESS.READABLE, CHAPTER_ACCESS.READABLE, CHAPTER_ACCESS.LOCKED],
  ),
  withChapterAccesses(
    makeBook('readability-tie-second', '可讀兩章後', '懸疑', '可讀排序樣本', '作者', 4),
    [
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.LOCKED,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.LOCKED,
    ],
  ),
  withChapterAccesses(
    makeBook('readability-low', '可讀一章', '懸疑', '可讀排序樣本', '作者', 2),
    [CHAPTER_ACCESS.READABLE, CHAPTER_ACCESS.LOCKED],
  ),
  withChapterAccesses(
    makeBook('readability-locked', '目前零章可讀', '懸疑', '可讀排序樣本', '作者', 2),
    [CHAPTER_ACCESS.LOCKED, CHAPTER_ACCESS.UNAVAILABLE],
  ),
  makeBook('readability-empty', '尚無章節', '懸疑', '可讀排序樣本', '作者', 0),
  makeBook(
    'readability-other-genre',
    '其他分類可讀四章',
    '仙俠',
    '可讀排序樣本',
    '作者',
    4,
  ),
  makeBook(
    'readability-outside-search',
    '搜尋外四章',
    '懸疑',
    '其他描述',
    '作者',
    4,
  ),
]

function getResultTitles(heading = '探索更多故事') {
  return within(
    screen.getByRole('region', { name: heading }),
  )
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent)
}

describe('CatalogScreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders exactly four books with a 全部 option and every represented genre', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument()
    for (const genre of ['懸疑', '仙俠', '都市', '言情']) {
      expect(screen.getByRole('button', { name: genre })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('共 4 本')).toBeInTheDocument()
  })

  it('sorts main results by chapter count stably without mutating the input order', () => {
    const inputOrder = sortingBooks.map(({ book }) => book.id)

    render(
      <CatalogScreen
        books={sortingBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    const sortControl = screen.getByLabelText('排序方式')
    expect(sortControl).toHaveValue('bookstore')
    expect(screen.getByRole('option', { name: '書庫順序' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: '章節較多優先' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: '章節較少優先' }),
    ).toBeInTheDocument()
    expect(getResultTitles()).toEqual([
      '來源第一本',
      '來源第二本',
      '來源第三本',
      '來源第四本',
    ])

    fireEvent.change(sortControl, { target: { value: 'chapters-desc' } })
    expect(getResultTitles()).toEqual([
      '來源第一本',
      '來源第三本',
      '來源第四本',
      '來源第二本',
    ])

    fireEvent.change(sortControl, { target: { value: 'chapters-asc' } })
    expect(getResultTitles()).toEqual([
      '來源第二本',
      '來源第四本',
      '來源第一本',
      '來源第三本',
    ])
    expect(sortingBooks.map(({ book }) => book.id)).toEqual(inputOrder)
  })

