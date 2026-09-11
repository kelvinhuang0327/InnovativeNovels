import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { RecentReadingEntry } from '../../application/library/libraryUseCases'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { LibraryScreen } from './LibraryScreen'

function makeBook(
  id: string,
  title: string,
  authorName = '作者',
): ContentBook {
  const typedBookId = bookId(id)
  const chapter = {
    id: chapterId(`${id}-chapter-1`),
    bookId: typedBookId,
    title: `${title} 第一章`,
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  }

  return {
    book: {
      id: typedBookId,
      title,
      authorName,
      categoryLabel: '分類',
    },
    description: '故事簡介',
    chapters: [chapter],
  }
}

const bookA = makeBook('book-a', '海邊書店')
const bookB = makeBook('book-b', '山中劍客')
const bookC = makeBook('book-c', '城市夜歸人')

function makeRecentReadingEntry(
  book: ContentBook,
  chapterProgress?: number,
): RecentReadingEntry {
  const chapter = book.chapters[0]

  if (chapterProgress === undefined) {
    return {
      book,
      chapterTitle: chapter.title,
    }
  }

  return {
    book,
    chapterTitle: chapter.title,
    position: {
      bookId: book.book.id,
      chapterId: chapter.id,
      paragraphIndex: 0,
      chapterProgress,
    },
  }
}

const baseProps = {
  books: [bookA],
  recentReading: [
    {
      book: bookB,
      chapterTitle: '山中劍客 第一章',
    },
  ] satisfies readonly RecentReadingEntry[],
  continueReading: [] as readonly ContinueReadingEntry[],
  onBackToBookstore: vi.fn(),
  onOpenBook: vi.fn(),
  onContinueBook: vi.fn(),
  onRemoveFromBookshelf: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('LibraryScreen', () => {
  it('renders saved books and recent books in the supplied order', () => {
    render(<LibraryScreen {...baseProps} />)

    const shelf = screen.getByRole('region', { name: '我的書架' })
    const recent = screen.getByRole('region', { name: '最近閱讀' })

    expect(within(shelf).getByText('海邊書店')).toBeInTheDocument()
    expect(within(recent).getByText('山中劍客')).toBeInTheDocument()
    expect(within(recent).getByText('目前章節 · 山中劍客 第一章')).toBeInTheDocument()
    expect(within(recent).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(recent).queryByText(/本章進度/)).not.toBeInTheDocument()
  })

  it('searches saved books by trimmed title or case-insensitive author in supplied order', () => {
    const savedBooks = [
      makeBook('search-city', '城市夜歸人', 'Alice Chen'),
      makeBook('search-sea', '海邊月色', 'Alice Smith'),
      makeBook('search-mountain', '山中劍客', 'Bob Stone'),
    ]

    render(
      <LibraryScreen
        {...baseProps}
        books={savedBooks}
        recentReading={[]}
      />,
    )

    const shelf = screen.getByRole('region', { name: '我的書架' })
    const search = within(shelf).getByRole('searchbox', { name: '搜尋我的書架' })

    expect(within(shelf).getByText('3 本')).toBeInTheDocument()
    expect(
      within(shelf)
        .getAllByRole('listitem')
        .map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['城市夜歸人', '海邊月色', '山中劍客'])
    expect(
      within(shelf).queryByRole('button', { name: '清除搜尋' }),
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '  ALICE  ' } })

    expect(within(shelf).getByText('2 / 3 本')).toBeInTheDocument()
    expect(
      within(shelf)
        .getAllByRole('listitem')
        .map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['城市夜歸人', '海邊月色'])
    expect(within(shelf).queryByText('山中劍客')).not.toBeInTheDocument()
    expect(
      within(shelf).getByRole('button', { name: '清除搜尋' }),
    ).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '  邊月  ' } })

    expect(within(shelf).getByText('1 / 3 本')).toBeInTheDocument()
    expect(within(shelf).getByText('海邊月色')).toBeInTheDocument()
    expect(within(shelf).queryByText('城市夜歸人')).not.toBeInTheDocument()
    expect(within(shelf).queryByText('山中劍客')).not.toBeInTheDocument()

    for (const nonSearchField of ['分類', '故事簡介', '第一章']) {
      fireEvent.change(search, { target: { value: nonSearchField } })
      expect(within(shelf).getByText('0 / 3 本')).toBeInTheDocument()
      expect(within(shelf).getByText('找不到符合條件的收藏')).toBeInTheDocument()
    }

    fireEvent.click(within(shelf).getByRole('button', { name: '清除搜尋' }))

    expect(search).toHaveValue('')
    expect(within(shelf).getByText('3 本')).toBeInTheDocument()
    expect(
      within(shelf)
        .getAllByRole('listitem')
        .map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['城市夜歸人', '海邊月色', '山中劍客'])
    expect(
      within(shelf).queryByRole('button', { name: '清除搜尋' }),
    ).not.toBeInTheDocument()
    expect(savedBooks.map((book) => book.book.id)).toEqual([
      'search-city',
      'search-sea',
      'search-mountain',
    ])
  })

  it('keeps empty and zero-match states distinct, leaves other shelves alone, and preserves saved-book actions', () => {
    const onBackToBookstore = vi.fn()
    const onContinueBook = vi.fn()
    const onOpenBook = vi.fn()
    const onRemoveFromBookshelf = vi.fn()
    const continueBook = makeBook('continue-only', '繼續故事', 'Continue Author')
    const continueChapter = continueBook.chapters[0]
    const continueEntry: ContinueReadingEntry = {
      book: continueBook,
      chapter: continueChapter,
      position: {
        bookId: continueBook.book.id,
        chapterId: continueChapter.id,
        paragraphIndex: 0,
        chapterProgress: 0.25,
      },
    }
    const recentBook = makeBook('recent-only', '最近故事', 'Recent Author')

    render(
      <LibraryScreen
        books={[bookA, bookB]}
        recentReading={[makeRecentReadingEntry(recentBook)]}
        continueReading={[continueEntry]}
        onBackToBookstore={onBackToBookstore}
        onOpenBook={onOpenBook}
        onContinueBook={onContinueBook}
        onRemoveFromBookshelf={onRemoveFromBookshelf}
      />,
    )

    const shelf = screen.getByRole('region', { name: '我的書架' })
    const search = within(shelf).getByRole('searchbox', { name: '搜尋我的書架' })
    const continueShelf = screen.getByRole('region', { name: '繼續閱讀' })
    const recentShelf = screen.getByRole('region', { name: '最近閱讀' })

    fireEvent.change(search, { target: { value: '不存在的收藏' } })

    expect(within(shelf).getByText('0 / 2 本')).toBeInTheDocument()
    expect(within(shelf).getByText('找不到符合條件的收藏')).toBeInTheDocument()
    expect(
      within(shelf).queryByText('還沒有收藏小說，從書城挑一本加入書架。'),
    ).not.toBeInTheDocument()
    expect(
      within(shelf).queryByRole('button', { name: '前往書城' }),
    ).not.toBeInTheDocument()
    expect(within(continueShelf).getByText('繼續故事')).toBeInTheDocument()
    expect(within(recentShelf).getByText('最近故事')).toBeInTheDocument()

    fireEvent.click(within(shelf).getByRole('button', { name: '清除搜尋' }))

    expect(onBackToBookstore).not.toHaveBeenCalled()
    expect(onContinueBook).not.toHaveBeenCalled()
    expect(onOpenBook).not.toHaveBeenCalled()
    expect(onRemoveFromBookshelf).not.toHaveBeenCalled()

    const matchingBook = within(shelf).getAllByRole('listitem')[0]
    fireEvent.click(within(matchingBook).getByRole('button', { name: '查看書籍' }))
    fireEvent.click(within(matchingBook).getByRole('button', { name: '移出書架' }))

    expect(onOpenBook).toHaveBeenCalledTimes(1)
    expect(onOpenBook).toHaveBeenCalledWith('book-a')
    expect(onRemoveFromBookshelf).toHaveBeenCalledTimes(1)
    expect(onRemoveFromBookshelf).toHaveBeenCalledWith('book-a')
    expect(onContinueBook).not.toHaveBeenCalled()
    expect(onBackToBookstore).not.toHaveBeenCalled()
  })

  it('keeps the unsaved-position state without inventing progress', () => {
    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[{ book: bookB }]}
      />,
    )

    const recent = screen.getByRole('region', { name: '最近閱讀' })
    expect(within(recent).getByText('尚未儲存閱讀位置')).toBeInTheDocument()
    expect(within(recent).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(recent).queryByText(/本章進度/)).not.toBeInTheDocument()
  })

  it('preserves recent-reading order and chapter titles', () => {
    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[
          makeRecentReadingEntry(bookB),
          makeRecentReadingEntry(bookA),
        ]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(
      items.map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['山中劍客', '海邊書店'])
    expect(within(items[0]).getByText('目前章節 · 山中劍客 第一章')).toBeInTheDocument()
    expect(within(items[1]).getByText('目前章節 · 海邊書店 第一章')).toBeInTheDocument()
  })

  it('shows saved chapter progress with accessible progress semantics', () => {
    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[
          makeRecentReadingEntry(bookA, 0),
          makeRecentReadingEntry(bookB, 0.425),
          makeRecentReadingEntry(bookC, 1),
        ]}
      />,
    )

    for (const [percentage, label] of [
      ['0', '本章進度 0%'],
      ['43', '本章進度 43%'],
      ['100', '本章進度 100%'],
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
      const progress = screen.getByRole('progressbar', { name: label })
      expect(progress).toHaveAttribute('max', '100')
      expect(progress).toHaveAttribute('value', percentage)
    }

    expect(screen.getByText('目前章節 · 海邊書店 第一章')).toBeInTheDocument()
  })

  it('clamps out-of-range progress and safely handles non-finite values', () => {
    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[
          makeRecentReadingEntry(makeBook('book-negative', '負值'), -0.2),
          makeRecentReadingEntry(makeBook('book-over', '超過'), 1.2),
          makeRecentReadingEntry(makeBook('book-nan', '不是數字'), Number.NaN),
          makeRecentReadingEntry(
            makeBook('book-infinity', '無限大'),
            Number.POSITIVE_INFINITY,
          ),
        ]}
      />,
    )

    expect(screen.getAllByText('本章進度 0%', { selector: 'p' })).toHaveLength(3)
    expect(screen.getAllByText('本章進度 100%', { selector: 'p' })).toHaveLength(1)
    expect(screen.queryByText(/NaN%|Infinity%/)).not.toBeInTheDocument()
    expect(
      screen.getAllByRole('progressbar').map((progress) => progress.getAttribute('value')),
    ).toEqual(['0', '100', '0', '0'])
  })

  it('opens a saved book, removes it, and opens a recent book for reading', () => {
    render(<LibraryScreen {...baseProps} />)

    const shelf = screen.getByRole('region', { name: '我的書架' })
    fireEvent.click(within(shelf).getByRole('button', { name: '查看書籍' }))
    fireEvent.click(within(shelf).getByRole('button', { name: '移出書架' }))
    fireEvent.click(
      within(screen.getByRole('region', { name: '最近閱讀' })).getByRole(
        'button',
        { name: '繼續閱讀' },
      ),
    )

    expect(baseProps.onOpenBook).toHaveBeenCalledWith('book-a')
    expect(baseProps.onRemoveFromBookshelf).toHaveBeenCalledWith('book-a')
    expect(baseProps.onContinueBook).toHaveBeenCalledWith('book-b')
  })

  it('invokes recent-reading callbacks once with the selected book id', () => {
    const onOpenBook = vi.fn()
    const onContinueBook = vi.fn()

    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[makeRecentReadingEntry(bookB, 0.42)]}
        onContinueBook={onContinueBook}
        onOpenBook={onOpenBook}
      />,
    )

    const recent = screen.getByRole('region', { name: '最近閱讀' })
    fireEvent.click(within(recent).getByRole('button', { name: '繼續閱讀' }))
    fireEvent.click(within(recent).getByRole('button', { name: '查看書籍' }))

    expect(onContinueBook).toHaveBeenCalledTimes(1)
    expect(onContinueBook).toHaveBeenCalledWith('book-b')
    expect(onOpenBook).toHaveBeenCalledTimes(1)
    expect(onOpenBook).toHaveBeenCalledWith('book-b')
  })

  it('shows Continue Reading only when entries exist and gives useful empty states', () => {
    const { rerender } = render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        recentReading={[]}
        continueReading={[]}
      />,
    )

    expect(screen.queryByRole('heading', { name: '繼續閱讀' })).not.toBeInTheDocument()
    expect(screen.getByText('還沒有收藏小說，從書城挑一本加入書架。')).toBeInTheDocument()
    expect(screen.getByText('開始閱讀後，最近看過的故事會出現在這裡。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '前往書城' }))
    expect(baseProps.onBackToBookstore).toHaveBeenCalled()

    const chapter = bookA.chapters[0]
    const continueEntry: ContinueReadingEntry = {
      book: bookA,
      chapter,
      position: {
        bookId: bookA.book.id,
        chapterId: chapter.id,
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    }

    rerender(
      <LibraryScreen
        {...baseProps}
        recentReading={[]}
        continueReading={[continueEntry]}
      />,
    )

    expect(screen.getByRole('region', { name: '繼續閱讀' })).toBeInTheDocument()
  })

  it('omits the redundant header-level return to Bookstore', () => {
    render(<LibraryScreen {...baseProps} />)

    expect(
      screen.queryByRole('button', { name: '返回書城' }),
    ).not.toBeInTheDocument()
    expect(baseProps.onBackToBookstore).not.toHaveBeenCalled()
  })
})
