import {
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { DEFAULT_READER_PREFERENCES } from '../../domain/reading/readerPreferences'
import { ReaderScreen } from './ReaderScreen'

const mockBook = {
  book: {
    id: bookId('b1'),
    title: 'Book One',
    authorName: 'Author',
    categoryLabel: 'Fiction',
  },
  description: 'Desc',
  chapters: [
    {
      id: chapterId('c1'),
      bookId: bookId('b1'),
      title: 'Chapter 1',
      sequence: chapterSequence(1),
      access: CHAPTER_ACCESS.READABLE,
    },
  ],
}

const mockOpenedChapter = {
  book: mockBook,
  chapter: mockBook.chapters[0],
  prose: ['Paragraph 1'],
  isLocked: false,
  hasPrevious: false,
  hasNext: true,
}

const mockTableOfContents = [
  {
    chapterId: mockBook.chapters[0].id,
    title: mockBook.chapters[0].title,
    sequence: mockBook.chapters[0].sequence,
    isAccessible: true,
    isCurrent: true,
  },
]

const mockChapterPosition = { currentPosition: 1, totalChapters: 1 }

describe('ReaderScreen Comfort & Bookmarks UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('applies preference state tokens to container and prose', () => {
    const preferences = {
      fontScale: 'large' as const,
      lineSpacing: 'spacious' as const,
      theme: 'sepia' as const,
    }

    const { container } = render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={preferences}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const section = container.querySelector('section')
    expect(section?.getAttribute('data-theme')).toBe('sepia')
    expect(section?.getAttribute('data-font-scale')).toBe('large')
    expect(section?.getAttribute('data-line-spacing')).toBe('spacious')

    const prose = container.querySelector('.reader-prose')
    expect(prose?.className).toContain('theme-sepia')
    expect(prose?.className).toContain('font-scale-large')
    expect(prose?.className).toContain('line-spacing-spacious')
  })

  it('triggers preference changes and reset', () => {
    const onChangePreferences = vi.fn()
    const onResetPreferences = vi.fn()

    render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={onChangePreferences}
        onResetPreferences={onResetPreferences}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const darkThemeButton = screen.getByRole('radio', { name: '暗黑' })
    fireEvent.click(darkThemeButton)
    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      theme: 'dark',
    })

    const resetButton = screen.getByRole('button', { name: '重設預設值' })
    fireEvent.click(resetButton)
    expect(onResetPreferences).toHaveBeenCalled()
  })

  it('displays bookmark button and handles toggle and modal opening', () => {
    const onToggleBookmark = vi.fn()

    render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={onToggleBookmark}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const bookmarkButton = screen.getByRole('button', { name: '加入章節書籤' })
    fireEvent.click(bookmarkButton)
    expect(onToggleBookmark).toHaveBeenCalled()

    const openBookmarksButton = screen.getByRole('button', {
      name: '開啟書籤列表',
    })
    fireEvent.click(openBookmarksButton)

    expect(screen.getByRole('dialog', { name: '章節書籤' })).toBeInTheDocument()
    expect(screen.getByText('尚無書籤')).toBeInTheDocument()
  })
})

describe('Reader Table of Contents & Chapter Position Progress', () => {
  afterEach(() => {
    cleanup()
  })

  const tocBook = {
    book: {
      id: bookId('toc-book'),
      title: 'TOC Book',
      authorName: 'Author',
      categoryLabel: 'Fiction',
    },
    description: 'Desc',
    chapters: [
      {
        id: chapterId('t1'),
        bookId: bookId('toc-book'),
        title: 'Chapter One',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
      {
        id: chapterId('t2'),
        bookId: bookId('toc-book'),
        title: 'Chapter Two',
        sequence: chapterSequence(2),
        access: CHAPTER_ACCESS.READABLE,
      },
      {
        id: chapterId('t3'),
        bookId: bookId('toc-book'),
        title: 'Chapter Three',
        sequence: chapterSequence(3),
        access: CHAPTER_ACCESS.LOCKED,
      },
    ],
  }

  const tocOpenedChapter = {
    book: tocBook,
    chapter: tocBook.chapters[0],
    prose: ['Paragraph 1'],
    isLocked: false,
    hasPrevious: false,
    hasNext: true,
  }

  const tocEntries = [
    {
      chapterId: chapterId('t1'),
      title: 'Chapter One',
      sequence: 1,
      isAccessible: true,
      isCurrent: true,
    },
    {
      chapterId: chapterId('t2'),
      title: 'Chapter Two',
      sequence: 2,
      isAccessible: true,
      isCurrent: false,
    },
    {
      chapterId: chapterId('t3'),
      title: 'Chapter Three',
      sequence: 3,
      isAccessible: false,
      isCurrent: false,
    },
  ]

  function renderReaderWithToc(
    onSelectChapter = vi.fn(),
    entries = tocEntries,
  ) {
    return render(
      <ReaderScreen
        openedChapter={tocOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={entries}
        chapterPosition={{ currentPosition: 1, totalChapters: 3 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={onSelectChapter}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )
  }

  it('displays chapter-position progress as "第 X / Y 章" without claiming paragraph or page completion', () => {
    renderReaderWithToc()

    const progress = screen.getByRole('progressbar', { name: '目前章節位置' })
    expect(progress).toHaveTextContent('第 1 / 3 章')
    expect(progress.textContent).not.toMatch(/%|頁|段落/)
  })

  it('does not render a progress indicator when the chapter position is unresolved', () => {
    render(
      <ReaderScreen
        openedChapter={tocOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={tocEntries}
        chapterPosition={undefined}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('opens the TOC listing every chapter in explicit order with the current chapter marked via aria-current', () => {
    renderReaderWithToc()
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const items = within(dialog)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('button') as HTMLButtonElement)

    expect(items.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Chapter One'),
      expect.stringContaining('Chapter Two'),
      expect.stringContaining('Chapter Three'),
    ])
    expect(items[0].getAttribute('aria-current')).toBe('true')
    expect(items[1].getAttribute('aria-current')).toBeNull()
    expect(items[2].getAttribute('aria-current')).toBeNull()
  })

  it('disables the locked chapter item and never invokes navigation for it', () => {
    const onSelectChapter = vi.fn()
    renderReaderWithToc(onSelectChapter)
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    const lockedItem = screen.getByText('Chapter Three').closest('button')
    expect(lockedItem).toBeDisabled()

    fireEvent.click(lockedItem as HTMLButtonElement)
    expect(onSelectChapter).not.toHaveBeenCalled()
  })

  it('invokes the normal chapter-open path with the exact ChapterId when an accessible item is selected', () => {
    const onSelectChapter = vi.fn()
    renderReaderWithToc(onSelectChapter)
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    fireEvent.click(screen.getByText('Chapter Two').closest('button') as HTMLButtonElement)

    expect(onSelectChapter).toHaveBeenCalledWith('t2')
    expect(screen.queryByRole('dialog', { name: '章節目錄' })).not.toBeInTheDocument()
  })

  it('shows a safe empty state instead of fabricating chapters when the list is empty', () => {
    renderReaderWithToc(vi.fn(), [])
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    expect(screen.getByText('尚無章節資料')).toBeInTheDocument()
  })

  it('moves focus into the dialog on open and returns focus to the trigger button on Escape', () => {
    renderReaderWithToc()

    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    expect(document.activeElement).toBe(dialog)

    fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: '章節目錄' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('returns focus to the trigger button when closed via the close button', () => {
    renderReaderWithToc()

    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })
    fireEvent.click(trigger)

    fireEvent.click(screen.getByRole('button', { name: '關閉章節目錄' }))

    expect(screen.queryByRole('dialog', { name: '章節目錄' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })
})

describe('ReaderScreen Persistent Chapter Navigation', () => {
  afterEach(() => {
    cleanup()
  })

  const navBook = {
    book: {
      id: bookId('nav-book'),
      title: 'Nav Book',
      authorName: 'Author',
      categoryLabel: 'Fiction',
    },
    description: 'Desc',
    chapters: [
      {
        id: chapterId('n1'),
        bookId: bookId('nav-book'),
        title: 'Chapter 1',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
      {
        id: chapterId('n2'),
        bookId: bookId('nav-book'),
        title: 'Chapter 2',
        sequence: chapterSequence(2),
        access: CHAPTER_ACCESS.READABLE,
      },
    ],
  }

  const firstChapter = {
    book: navBook,
    chapter: navBook.chapters[0],
    prose: ['Paragraph 1'],
    isLocked: false,
    hasPrevious: false,
    hasNext: true,
  }

  const lastChapter = {
    book: navBook,
    chapter: navBook.chapters[1],
    prose: ['Paragraph 2'],
    isLocked: false,
    hasPrevious: true,
    hasNext: false,
  }

  it('renders persistent navigation controls in ReaderScreen with aria-label', () => {
    render(
      <ReaderScreen
        openedChapter={firstChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={[]}
        chapterPosition={{ currentPosition: 1, totalChapters: 2 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    expect(persistentNav).toBeInTheDocument()
    expect(persistentNav).toHaveAttribute('aria-label', '章節快捷導覽')
    expect(within(persistentNav).getByRole('button', { name: '上一章' })).toBeInTheDocument()
    expect(within(persistentNav).getByRole('button', { name: '下一章' })).toBeInTheDocument()
    expect(within(persistentNav).getByText('第 1 / 2 章')).toBeInTheDocument()
  })

  it('disables previous control when on the first chapter and enables next control', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()

    render(
      <ReaderScreen
        openedChapter={firstChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={[]}
        chapterPosition={{ currentPosition: 1, totalChapters: 2 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )

    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    const prevBtn = within(persistentNav).getByRole('button', { name: '上一章' })
    const nextBtn = within(persistentNav).getByRole('button', { name: '下一章' })

    expect(prevBtn).toBeDisabled()
    expect(prevBtn).toHaveAttribute('aria-disabled', 'true')
    expect(nextBtn).not.toBeDisabled()

    fireEvent.click(nextBtn)
    expect(onNext).toHaveBeenCalledTimes(1)

    fireEvent.click(prevBtn)
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('disables next control when on the last available chapter', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()

    render(
      <ReaderScreen
        openedChapter={lastChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={[]}
        chapterPosition={{ currentPosition: 2, totalChapters: 2 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )

    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    const prevBtn = within(persistentNav).getByRole('button', { name: '上一章' })
    const nextBtn = within(persistentNav).getByRole('button', { name: '下一章' })

    expect(nextBtn).toBeDisabled()
    expect(nextBtn).toHaveAttribute('aria-disabled', 'true')
    expect(prevBtn).not.toBeDisabled()

    fireEvent.click(prevBtn)
    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('provides an accessible polite live region announcing chapter change', () => {
    render(
      <ReaderScreen
        openedChapter={firstChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={[]}
        chapterPosition={{ currentPosition: 1, totalChapters: 2 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const liveRegion = screen.getByRole('status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveTextContent('已切換至：Chapter 1')
  })

  it('exposes an accessible 返回作品 exit action that triggers onBackToBook', () => {
    const onBackToBook = vi.fn()
    render(
      <ReaderScreen
        openedChapter={firstChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={[]}
        chapterPosition={{ currentPosition: 1, totalChapters: 2 }}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={onBackToBook}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const backBtn = screen.getByRole('button', { name: '返回作品' })
    expect(backBtn).toBeInTheDocument()
    fireEvent.click(backBtn)
    expect(onBackToBook).toHaveBeenCalledTimes(1)
  })
})

