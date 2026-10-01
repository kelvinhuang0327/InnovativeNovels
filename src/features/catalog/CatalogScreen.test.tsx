import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
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

  it('sorts by title and author ascending while preserving default and tie order', () => {
    const onOpenBook = vi.fn()

    render(
      <CatalogScreen
        books={metadataSortingBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    const sortControl = screen.getByLabelText('排序方式')
    expect(getResultTitles()).toEqual(['Zulu', 'Alpha', 'Echo', 'Bravo'])
    expect(screen.getByRole('option', { name: '書名升冪' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '作者升冪' })).toBeInTheDocument()

    fireEvent.change(sortControl, { target: { value: 'title-asc' } })
    expect(getResultTitles()).toEqual(['Alpha', 'Bravo', 'Echo', 'Zulu'])

    fireEvent.change(sortControl, { target: { value: 'author-asc' } })
    expect(getResultTitles()).toEqual(['Echo', 'Alpha', 'Zulu', 'Bravo'])

    const resultsRegion = screen.getByRole('region', { name: '探索更多故事' })
    fireEvent.click(
      within(resultsRegion).getAllByRole('button', { name: '查看書籍' })[0],
    )
    expect(onOpenBook).toHaveBeenCalledWith('metadata-echo')
  })

  it('keeps title sorting through search, whitespace, and clearing filters', () => {
    render(
      <CatalogScreen
        books={metadataSortingBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    const searchInput = screen.getByLabelText('搜尋小說')
    const sortControl = screen.getByLabelText('排序方式')
    fireEvent.change(searchInput, { target: { value: 'Wendy' } })
    fireEvent.change(sortControl, { target: { value: 'title-asc' } })

    expect(getResultTitles('篩選結果')).toEqual(['Bravo', 'Zulu'])

    fireEvent.change(searchInput, { target: { value: '  \t  ' } })
    expect(getResultTitles()).toEqual(['Alpha', 'Bravo', 'Echo', 'Zulu'])
    expect(sortControl).toHaveValue('title-asc')

    fireEvent.change(searchInput, { target: { value: 'Ann' } })
    expect(getResultTitles('篩選結果')).toEqual(['Echo'])
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(getResultTitles()).toEqual(['Alpha', 'Bravo', 'Echo', 'Zulu'])
    expect(searchInput).toHaveValue('')
    expect(sortControl).toHaveValue('title-asc')
  })

  it('sorts after title, author, and description search filtering', () => {
    const searchableBooks: readonly ContentBook[] = [
      makeBook(
        'search-title',
        '排序中的潮聲',
        '懸疑',
        '沒有這個搜尋詞',
        '作者 A',
        1,
      ),
      makeBook(
        'search-author',
        '平靜書名',
        '懸疑',
        '沒有這個搜尋詞',
        '排序作者',
        3,
      ),
      makeBook(
        'search-description',
        '另一個書名',
        '懸疑',
        '描述包含排序詞',
        '作者 C',
        2,
      ),
      makeBook(
        'search-no-match',
        '不相關的書',
        '懸疑',
        '普通描述',
        '作者 D',
        4,
      ),
    ]

    render(
      <CatalogScreen
        books={searchableBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '排序' },
    })
    fireEvent.change(screen.getByLabelText('排序方式'), {
      target: { value: 'chapters-desc' },
    })

    expect(getResultTitles('篩選結果')).toEqual([
      '平靜書名',
      '另一個書名',
      '排序中的潮聲',
    ])
    expect(screen.getByText('找到 3 本')).toBeInTheDocument()
  })

  it('sorts the selected genre subset', () => {
    render(
      <CatalogScreen
        books={sortingBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('排序方式'), {
      target: { value: 'chapters-desc' },
    })
    fireEvent.click(screen.getByRole('button', { name: '仙俠' }))

    expect(getResultTitles('篩選結果')).toEqual(['來源第四本', '來源第二本'])
    expect(screen.getByText('找到 2 本')).toBeInTheDocument()
  })

  it('keeps sort-only state outside filtering and preserves callbacks and stable IDs', () => {
    const onContinueBook = vi.fn()
    const onOpenAuthoring = vi.fn()
    const onOpenBook = vi.fn()
    const chapter = sortingBooks[0].chapters[0]
    const continueEntry: ContinueReadingEntry = {
      book: sortingBooks[0],
      chapter,
      position: {
        bookId: sortingBooks[0].book.id,
        chapterId: chapter.id,
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    }

    render(
      <CatalogScreen
        books={sortingBooks}
        continueReading={[continueEntry]}
        onContinueBook={onContinueBook}
        onOpenAuthoring={onOpenAuthoring}
        onOpenBook={onOpenBook}
      />,
    )

    fireEvent.change(screen.getByLabelText('排序方式'), {
      target: { value: 'title-asc' },
    })

    expect(screen.getByRole('heading', { name: '探索故事' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '閱讀焦點作品' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '繼續閱讀' })).toBeInTheDocument()
    const editorialShelf = screen.getByRole('region', { name: '編輯精選' })
    expect(
      within(editorialShelf)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.getAttribute('aria-label')),
    ).toEqual(['來源第一本', '來源第二本', '來源第三本'])
    expect(screen.queryByRole('heading', { name: '篩選結果' })).not.toBeInTheDocument()
    expect(screen.getByText('共 4 本')).toBeInTheDocument()
    expect(onOpenBook).not.toHaveBeenCalled()
    expect(onContinueBook).not.toHaveBeenCalled()
    expect(onOpenAuthoring).not.toHaveBeenCalled()

    const resultsRegion = screen.getByRole('region', { name: '探索更多故事' })
    const selectedBookCard = within(resultsRegion)
      .getByRole('heading', { level: 3, name: '來源第一本' })
      .closest('article')
    expect(selectedBookCard).not.toBeNull()
    fireEvent.click(
      within(selectedBookCard as HTMLElement).getByRole('button', {
        name: '查看書籍',
      }),
    )

    expect(onOpenBook).toHaveBeenCalledTimes(1)
    expect(onOpenBook).toHaveBeenCalledWith('sort-a')
    expect(onContinueBook).not.toHaveBeenCalled()
    expect(onOpenAuthoring).not.toHaveBeenCalled()
  })

  it('opens the deterministic first book from the bookstore hero action', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '閱讀焦點作品' }))

    expect(onOpenBook).toHaveBeenCalledWith('book-a')
  })

  it('leaves persistent top-level navigation to the App shell', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '我的書架' }),
    ).not.toBeInTheDocument()
  })

  it('keeps every input book reachable through its card action', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    screen
      .getAllByRole('button', { name: '查看書籍' })
      .forEach((button) => fireEvent.click(button))

    expect(onOpenBook.mock.calls).toEqual([
      ['book-a'],
      ['book-b'],
      ['book-c'],
      ['book-d'],
    ])
  })

  it('renders Continue Reading only when entries exist and preserves its action', () => {
    const onContinueBook = vi.fn()
    const chapter = books[0].chapters[0]
    const continueEntry: ContinueReadingEntry = {
      book: books[0],
      chapter,
      position: {
        bookId: books[0].book.id,
        chapterId: chapter.id,
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    }

    const emptyShelf = render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={onContinueBook}
        onOpenBook={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('heading', { name: '繼續閱讀' }),
    ).not.toBeInTheDocument()
    emptyShelf.unmount()

    render(
      <CatalogScreen
        books={books}
        continueReading={[continueEntry]}
        onContinueBook={onContinueBook}
        onOpenBook={vi.fn()}
      />,
    )

    const shelf = screen.getByRole('region', { name: '繼續閱讀' })
    expect(shelf).toHaveTextContent('海邊書店')
    expect(shelf).toHaveTextContent('第一章')
    fireEvent.click(within(shelf).getByRole('button', { name: '繼續閱讀' }))

    expect(onContinueBook).toHaveBeenCalledWith('book-a')
  })

  it('filters to matching books when a genre is selected', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '仙俠' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '仙俠' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('找到 1 本')).toBeInTheDocument()
  })

  it('matches search text against the title', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
  })

  it('matches search text against the author', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '岑海' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
  })

  it('matches Latin author names case-insensitively', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: 'wendy' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('雨中告白')).toBeInTheDocument()
  })

  it('trims whitespace-only and surrounding-whitespace search input', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '  劍客  ' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '   ' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(4)
  })

  it('matches search text against the description', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '告白' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('combines search and genre filter by intersection', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '告白' },
    })
    fireEvent.click(screen.getByRole('button', { name: '言情' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('雨中告白')).toBeInTheDocument()
    expect(screen.getByText('找到 1 本')).toBeInTheDocument()
  })

  it('shows an accessible empty state with a reset action for a query that matches nothing', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '不存在的關鍵字' },
    })

    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      '找不到符合條件的小說',
    )
    expect(screen.getByText('找到 0 本')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '清除篩選' }),
    ).toBeInTheDocument()
  })

  it('clears search and genre filter back to all books', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('排序方式'), {
      target: { value: 'chapters-desc' },
    })
    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })
    fireEvent.click(screen.getByRole('button', { name: '仙俠' }))
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByLabelText('搜尋小說')).toHaveValue('')
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('共 4 本')).toBeInTheDocument()
    expect(screen.getByLabelText('排序方式')).toHaveValue('chapters-desc')
  })

  it('resets from the empty state back to the full catalog', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '不存在的關鍵字' },
    })
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('preserves stable Book IDs through the onOpenBook callback', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[1])

    expect(onOpenBook).toHaveBeenCalledWith('book-b')
  })

  it('hides editorial discovery while filtered so results remain authoritative', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '編輯精選' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })

    expect(
      screen.queryByRole('heading', { name: '編輯精選' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '篩選結果' }),
    ).toBeInTheDocument()
  })

  it('keeps Authoring secondary when supplied and absent when unavailable', () => {
    const onOpenAuthoring = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenAuthoring={onOpenAuthoring}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟創作預覽' }))
    expect(onOpenAuthoring).toHaveBeenCalledOnce()
    cleanup()

    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: '開啟創作預覽' }),
    ).not.toBeInTheDocument()
  })

  it('renders accurate readable depth labels for fully openable and partially accessible books', () => {
    const mixedBooks: readonly ContentBook[] = [
      {
        book: {
          id: bookId('full-book'),
          title: '全本小說',
          authorName: '沈墨',
          categoryLabel: '懸疑',
        },
        description: '全本開放閱讀',
        chapters: [
          {
            id: chapterId('f1'),
            bookId: bookId('full-book'),
            title: '第一章',
            sequence: chapterSequence(1),
            access: CHAPTER_ACCESS.READABLE,
          },
          {
            id: chapterId('f2'),
            bookId: bookId('full-book'),
            title: '第二章',
            sequence: chapterSequence(2),
            access: CHAPTER_ACCESS.READABLE,
          },
        ],
      },
      {
        book: {
          id: bookId('partial-book'),
          title: '部分解鎖小說',
          authorName: '岑海',
          categoryLabel: '仙俠',
        },
        description: '前兩章開放第三章鎖定',
        chapters: [
          {
            id: chapterId('p1'),
            bookId: bookId('partial-book'),
            title: '第一章',
            sequence: chapterSequence(1),
            access: CHAPTER_ACCESS.READABLE,
          },
          {
            id: chapterId('p2'),
            bookId: bookId('partial-book'),
            title: '第二章',
            sequence: chapterSequence(2),
            access: CHAPTER_ACCESS.PREVIEW,
          },
          {
            id: chapterId('p3'),
            bookId: bookId('partial-book'),
            title: '第三章',
            sequence: chapterSequence(3),
            access: CHAPTER_ACCESS.LOCKED,
          },
        ],
      },
    ]

    render(
      <CatalogScreen
        books={mixedBooks}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    // Verify normal book cards
    const resultsRegion = screen.getByRole('region', { name: '探索更多故事' })
    const fullCard = within(resultsRegion)
      .getByRole('heading', { level: 3, name: '全本小說' })
      .closest('article')
    const partialCard = within(resultsRegion)
      .getByRole('heading', { level: 3, name: '部分解鎖小說' })
      .closest('article')

    expect(fullCard).not.toBeNull()
    expect(partialCard).not.toBeNull()
    expect(within(fullCard as HTMLElement).getByText('2 章可讀')).toBeInTheDocument()
    expect(within(partialCard as HTMLElement).getByText('可讀 2 / 3 章')).toBeInTheDocument()

    // Verify editorial shelf
    const editorialShelf = screen.getByRole('region', { name: '編輯精選' })
    expect(within(editorialShelf).getByText('沈墨 · 2 章可讀')).toBeInTheDocument()
    expect(within(editorialShelf).getByText('岑海 · 可讀 2 / 3 章')).toBeInTheDocument()
  })
})
