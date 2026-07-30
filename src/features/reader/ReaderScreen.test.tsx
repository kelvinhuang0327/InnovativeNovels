import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  initialChapterProgress: 0,
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
      fontFamily: 'serif' as const,
      fontScale: 'large' as const,
      letterSpacing: 'relaxed' as const,
      lineSpacing: 'spacious' as const,
      readingMode: 'continuous' as const,
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
    expect(section?.getAttribute('data-font-family')).toBe('serif')
    expect(section?.getAttribute('data-font-scale')).toBe('large')
    expect(section?.getAttribute('data-letter-spacing')).toBe('relaxed')
    expect(section?.getAttribute('data-line-spacing')).toBe('spacious')
    expect(section?.getAttribute('data-reading-mode')).toBe('continuous')

    const prose = container.querySelector('.reader-prose')
    expect(prose?.className).toContain('theme-sepia')
    expect(prose?.className).toContain('font-family-serif')
    expect(prose?.className).toContain('font-scale-large')
    expect(prose?.className).toContain('letter-spacing-relaxed')
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
    initialChapterProgress: 0,
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

    expect(
      screen.queryByRole('progressbar', { name: '目前章節位置' }),
    ).not.toBeInTheDocument()
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

describe('ReaderScreen Live Chapter Progress', () => {
  let animationFrames: FrameRequestCallback[]

  beforeEach(() => {
    animationFrames = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('innerHeight', 400)
    vi.stubGlobal('scrollY', 0)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  function flushAnimationFrame() {
    const callbacks = animationFrames.splice(0)

    act(() => {
      callbacks.forEach((callback) => callback(0))
    })
  }

  function renderReader(
    openedChapter = mockOpenedChapter,
    extraProps: {
      onProgressChange?: (chapterProgress: number) => void
      onBackToBook?: () => void
    } = {},
  ) {
    return render(
      <ReaderScreen
        openedChapter={openedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
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
        onBackToBook={extraProps.onBackToBook ?? vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onProgressChange={extraProps.onProgressChange}
      />,
    )
  }

  function mockReaderGeometry(reader: HTMLElement, readerTopRef: { current: number }) {
    const readerHeight = 1000

    Object.defineProperty(reader, 'scrollHeight', {
      configurable: true,
      value: readerHeight,
    })
    vi.spyOn(reader, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: readerTopRef.current + readerHeight,
      height: readerHeight,
      left: 0,
      right: 640,
      top: readerTopRef.current,
      width: 640,
      x: 0,
      y: readerTopRef.current,
      toJSON: () => ({}),
    }))
  }

  it('reports bounded chapter progress from actual Reader geometry and recomputes on chapter change', () => {
    let readerTop = 0
    const readerHeight = 1000
    const { rerender } = renderReader()
    const reader = screen.getByLabelText('閱讀器')

    Object.defineProperty(reader, 'scrollHeight', {
      configurable: true,
      value: readerHeight,
    })
    vi.spyOn(reader, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: readerTop + readerHeight,
      height: readerHeight,
      left: 0,
      right: 640,
      top: readerTop,
      width: 640,
      x: 0,
      y: readerTop,
      toJSON: () => ({}),
    }))

    flushAnimationFrame()

    const progress = () =>
      screen.getByRole('progressbar', { name: '本章閱讀進度' })

    expect(progress()).toHaveAttribute('aria-valuenow', '0')
    expect(progress()).toHaveAttribute(
      'aria-valuetext',
      '本章閱讀進度 0%',
    )
    expect(progress()).toHaveTextContent('本章閱讀進度 0%')

    readerTop = -300
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    flushAnimationFrame()

    expect(progress()).toHaveAttribute('aria-valuenow', '50')
    expect(progress()).toHaveTextContent('本章閱讀進度 50%')

    readerTop = -600
    vi.stubGlobal('scrollY', 600)
    fireEvent.scroll(window)
    flushAnimationFrame()

    expect(progress()).toHaveAttribute('aria-valuenow', '100')
    expect(progress()).toHaveTextContent('本章閱讀進度 100%')

    const nextChapter = {
      ...mockOpenedChapter,
      chapter: {
        ...mockOpenedChapter.chapter,
        id: chapterId('c2'),
        title: 'Chapter 2',
        sequence: chapterSequence(2),
      },
      prose: ['Paragraph 2'],
    }

    readerTop = 0
    vi.stubGlobal('scrollY', 0)
    rerender(
      <ReaderScreen
        openedChapter={nextChapter}
        preferences={DEFAULT_READER_PREFERENCES}
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

    expect(progress()).toHaveAttribute('aria-valuenow', '0')
    flushAnimationFrame()
    expect(progress()).toHaveAttribute('aria-valuenow', '0')
  })

  it('does not expose live progress for locked prose', () => {
    renderReader({
      ...mockOpenedChapter,
      prose: [],
      isLocked: true,
    })

    expect(
      screen.queryByRole('progressbar', { name: '本章閱讀進度' }),
    ).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('chapter-prose')).toHaveLength(0)
  })

  it('reports chapterProgress to onProgressChange only when the displayed percent changes (bounded scheduling)', () => {
    const onProgressChange = vi.fn()
    const readerTopRef = { current: 0 }
    renderReader(mockOpenedChapter, { onProgressChange })
    const reader = screen.getByLabelText('閱讀器')
    mockReaderGeometry(reader, readerTopRef)

    flushAnimationFrame()
    expect(onProgressChange).toHaveBeenNthCalledWith(1, 0)

    readerTopRef.current = -300
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    flushAnimationFrame()
    expect(onProgressChange).toHaveBeenNthCalledWith(2, 0.5)

    // Re-flushing at the same scroll position must not add another write.
    fireEvent.scroll(window)
    flushAnimationFrame()
    expect(onProgressChange).toHaveBeenCalledTimes(2)

    readerTopRef.current = -600
    vi.stubGlobal('scrollY', 600)
    fireEvent.scroll(window)
    flushAnimationFrame()
    expect(onProgressChange).toHaveBeenNthCalledWith(3, 1)
    expect(onProgressChange).toHaveBeenCalledTimes(3)
  })

  it('does not attempt a scroll restoration when initialChapterProgress is 0', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo')
    const readerTopRef = { current: 0 }
    renderReader(mockOpenedChapter)
    const reader = screen.getByLabelText('閱讀器')
    mockReaderGeometry(reader, readerTopRef)

    flushAnimationFrame()

    expect(scrollToSpy).not.toHaveBeenCalled()
  })

  it('restores scroll position from initialChapterProgress after layout and keeps the live indicator synchronized', () => {
    const readerTopRef = { current: 0 }
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation((_x?: unknown, y?: unknown) => {
        const targetY = typeof y === 'number' ? y : 0
        vi.stubGlobal('scrollY', targetY)
        readerTopRef.current = -targetY
      })

    renderReader({ ...mockOpenedChapter, initialChapterProgress: 0.5 })
    const reader = screen.getByLabelText('閱讀器')
    mockReaderGeometry(reader, readerTopRef)

    flushAnimationFrame()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 300)
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '50')
  })

  it('flushes the latest chapter progress via onProgressChange before invoking onBackToBook on explicit exit', () => {
    const onProgressChange = vi.fn()
    const onBackToBook = vi.fn()
    const readerTopRef = { current: 0 }
    renderReader(mockOpenedChapter, { onProgressChange, onBackToBook })
    const reader = screen.getByLabelText('閱讀器')
    mockReaderGeometry(reader, readerTopRef)

    flushAnimationFrame()

    readerTopRef.current = -450
    vi.stubGlobal('scrollY', 450)
    fireEvent.scroll(window)
    flushAnimationFrame()

    const callOrder: string[] = []
    onProgressChange.mockImplementation(() => callOrder.push('progress'))
    onBackToBook.mockImplementation(() => callOrder.push('back'))

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

    expect(onProgressChange).toHaveBeenLastCalledWith(0.75)
    expect(callOrder).toEqual(['progress', 'back'])
  })

  it('does not flush progress on exit for a locked chapter', () => {
    const onProgressChange = vi.fn()
    const onBackToBook = vi.fn()
    renderReader(
      { ...mockOpenedChapter, isLocked: true },
      { onProgressChange, onBackToBook },
    )

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

    expect(onProgressChange).not.toHaveBeenCalled()
    expect(onBackToBook).toHaveBeenCalledTimes(1)
  })

  it('flushes the latest chapter progress on a pagehide reload lifecycle event', () => {
    const onProgressChange = vi.fn()
    const readerTopRef = { current: 0 }
    renderReader(mockOpenedChapter, { onProgressChange })
    const reader = screen.getByLabelText('閱讀器')
    mockReaderGeometry(reader, readerTopRef)

    flushAnimationFrame()

    readerTopRef.current = -300
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    flushAnimationFrame()
    onProgressChange.mockClear()

    fireEvent(window, new Event('pagehide'))

    expect(onProgressChange).toHaveBeenCalledWith(0.5)
  })
})

describe('ReaderScreen prose swipe navigation', () => {
  afterEach(() => {
    cleanup()
  })

  function renderSwipeReader(
    openedChapter = mockOpenedChapter,
    callbacks: {
      readonly onPrevious?: () => void
      readonly onNext?: () => void
    } = {},
  ) {
    const onPrevious = callbacks.onPrevious ?? vi.fn()
    const onNext = callbacks.onNext ?? vi.fn()
    const result = render(
      <ReaderScreen
        openedChapter={openedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
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
        onPrevious={onPrevious}
        onNext={onNext}
      />,
    )

    return {
      ...result,
      onPrevious,
      onNext,
      prose: screen.getByLabelText('章節內文'),
    }
  }

  function swipe(
    target: HTMLElement,
    {
      startX,
      startY,
      endX,
      endY,
      pointerId = 1,
    }: {
      readonly startX: number
      readonly startY: number
      readonly endX: number
      readonly endY: number
      readonly pointerId?: number
    },
  ) {
    fireEvent.pointerDown(target, {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: startX,
      clientY: startY,
    })
    fireEvent.pointerUp(target, {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: endX,
      clientY: endY,
    })
  }

  it('invokes next exactly once for one deliberate left swipe', () => {
    const { onNext, prose } = renderSwipeReader()

    swipe(prose, { startX: 180, startY: 100, endX: 80, endY: 104 })
    fireEvent.pointerUp(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 104,
    })

    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('invokes previous exactly once for one deliberate right swipe', () => {
    const onPrevious = vi.fn()
    const { prose } = renderSwipeReader(
      { ...mockOpenedChapter, hasPrevious: true },
      { onPrevious },
    )

    swipe(prose, { startX: 60, startY: 100, endX: 160, endY: 96 })

    expect(onPrevious).toHaveBeenCalledTimes(1)
  })

  it('ignores horizontal movement below the deliberate swipe threshold', () => {
    const { onNext, prose } = renderSwipeReader()

    swipe(prose, { startX: 140, startY: 100, endX: 80, endY: 100 })

    expect(onNext).not.toHaveBeenCalled()
  })

  it('ignores primarily vertical movement so native scrolling remains navigation-free', () => {
    const { onPrevious, onNext, prose } = renderSwipeReader({
      ...mockOpenedChapter,
      hasPrevious: true,
    })

    swipe(prose, { startX: 100, startY: 40, endX: 112, endY: 150 })

    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('ignores a diagonal gesture below the horizontal-dominance ratio', () => {
    const { onPrevious, onNext, prose } = renderSwipeReader({
      ...mockOpenedChapter,
      hasPrevious: true,
    })

    swipe(prose, { startX: 180, startY: 50, endX: 90, endY: 120 })

    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('ignores gestures on controls and gestures that leave the prose surface', () => {
    const { onPrevious, onNext, prose } = renderSwipeReader({
      ...mockOpenedChapter,
      hasPrevious: true,
    })
    const tocButton = screen.getByRole('button', { name: '開啟章節目錄' })

    swipe(tocButton, {
      startX: 180,
      startY: 100,
      endX: 80,
      endY: 100,
    })

    fireEvent.pointerDown(prose, {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 180,
      clientY: 100,
    })
    fireEvent.pointerLeave(prose, {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: 70,
      clientY: 100,
    })
    fireEvent.pointerUp(prose, {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 70,
      clientY: 100,
    })

    expect(onPrevious).not.toHaveBeenCalled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('respects first and last chapter boundaries', () => {
    const first = renderSwipeReader()
    swipe(first.prose, {
      startX: 60,
      startY: 100,
      endX: 160,
      endY: 100,
    })
    expect(first.onPrevious).not.toHaveBeenCalled()
    first.unmount()

    const last = renderSwipeReader({
      ...mockOpenedChapter,
      hasPrevious: true,
      hasNext: false,
    })
    swipe(last.prose, {
      startX: 180,
      startY: 100,
      endX: 80,
      endY: 100,
    })
    expect(last.onNext).not.toHaveBeenCalled()
  })

  it('clears an unfinished gesture on pointer cancellation and chapter change', () => {
    const onNext = vi.fn()
    const { prose, rerender } = renderSwipeReader(mockOpenedChapter, { onNext })

    fireEvent.pointerDown(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 180,
      clientY: 100,
    })
    fireEvent.pointerCancel(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    })
    fireEvent.pointerUp(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 80,
      clientY: 100,
    })

    fireEvent.pointerDown(prose, {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 180,
      clientY: 100,
    })
    rerender(
      <ReaderScreen
        openedChapter={{
          ...mockOpenedChapter,
          chapter: {
            ...mockOpenedChapter.chapter,
            id: chapterId('c2'),
            title: 'Chapter 2',
            sequence: chapterSequence(2),
          },
        }}
        preferences={DEFAULT_READER_PREFERENCES}
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
        onNext={onNext}
      />,
    )
    fireEvent.pointerUp(screen.getByLabelText('章節內文'), {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 80,
      clientY: 100,
    })

    expect(onNext).not.toHaveBeenCalled()
  })
})

describe('ReaderScreen paged mode navigation', () => {
  let animationFrames: FrameRequestCallback[]

  beforeEach(() => {
    animationFrames = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function flushAnimationFrame() {
    const callbacks = animationFrames.splice(0)

    act(() => {
      callbacks.forEach((callback) => callback(0))
    })
  }

  function renderPagedReader({
    openedChapter = mockOpenedChapter,
    onPrevious = vi.fn(),
    onNext = vi.fn(),
    onProgressChange = vi.fn(),
    canNavigateNextChapter = true,
    initialScrollWidth = 900,
  }: {
    readonly openedChapter?: typeof mockOpenedChapter
    readonly onPrevious?: () => void
    readonly onNext?: () => void
    readonly onProgressChange?: (chapterProgress: number) => void
    readonly canNavigateNextChapter?: boolean
    readonly initialScrollWidth?: number
  } = {}) {
    const result = render(
      <ReaderScreen
        openedChapter={openedChapter}
        preferences={{
          ...DEFAULT_READER_PREFERENCES,
          readingMode: 'paged',
        }}
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
        onPrevious={onPrevious}
        onNext={onNext}
        canNavigateNextChapter={canNavigateNextChapter}
        onProgressChange={onProgressChange}
      />,
    )

    const viewport = screen.getByLabelText('分頁閱讀區')
    const prose = screen.getByLabelText('章節內文')
    let scrollWidth = initialScrollWidth
    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      value: 300,
    })
    Object.defineProperty(prose, 'scrollWidth', {
      configurable: true,
      get: () => scrollWidth,
    })
    flushAnimationFrame()

    return {
      ...result,
      viewport,
      prose,
      onPrevious,
      onNext,
      onProgressChange,
      reflowToWidth(nextScrollWidth: number) {
        scrollWidth = nextScrollWidth
        fireEvent(window, new Event('resize'))
        flushAnimationFrame()
      },
    }
  }

  function swipe(
    target: HTMLElement,
    startX: number,
    endX: number,
    pointerId = 1,
  ) {
    fireEvent.pointerDown(target, {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: startX,
      clientY: 100,
    })
    fireEvent.pointerUp(target, {
      pointerId,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: endX,
      clientY: 100,
    })
  }

  it('uses a focusable CSS-column viewport and visible page controls', () => {
    const { viewport, prose } = renderPagedReader()

    expect(viewport).toHaveAttribute('tabindex', '0')
    expect(prose).toHaveClass('reader-prose-paged')
    expect(prose.style.columnWidth).toBe('300px')
    expect(screen.getByRole('navigation', { name: '分頁導覽' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一頁' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一頁' })).not.toBeDisabled()
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 1 / 3 頁',
    )
  })

  it('turns exactly one page per swipe and crosses to the next chapter only at the final page', () => {
    const { viewport, onNext, onProgressChange } = renderPagedReader()

    swipe(viewport, 180, 80)
    fireEvent.pointerUp(viewport, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 20,
      clientY: 100,
    })
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 2 / 3 頁',
    )
    expect(onNext).not.toHaveBeenCalled()

    swipe(viewport, 180, 80, 2)
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 3 / 3 頁',
    )
    expect(onNext).not.toHaveBeenCalled()

    swipe(viewport, 180, 80, 3)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onProgressChange).toHaveBeenCalledWith(0.5)
    expect(onProgressChange).toHaveBeenCalledWith(1)
  })

  it('mirrors page-boundary behavior in buttons and focused keyboard commands', () => {
    const onPrevious = vi.fn()
    const { viewport, onNext } = renderPagedReader({
      openedChapter: {
        ...mockOpenedChapter,
        hasPrevious: true,
      },
      onPrevious,
    })

    fireEvent.click(screen.getByRole('button', { name: '上一頁' }))
    expect(onPrevious).toHaveBeenCalledTimes(1)

    viewport.focus()
    fireEvent.keyDown(viewport, { key: 'ArrowRight' })
    fireEvent.keyDown(viewport, { key: 'PageDown' })
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 3 / 3 頁',
    )
    expect(onNext).not.toHaveBeenCalled()

    fireEvent.keyDown(viewport, { key: 'ArrowRight' })
    expect(onNext).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(viewport, { key: 'PageUp' })
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 2 / 3 頁',
    )
  })

  it('restores normalized progress to the nearest CSS-column page', () => {
    renderPagedReader({
      openedChapter: {
        ...mockOpenedChapter,
        initialChapterProgress: 0.5,
      },
    })

    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 2 / 3 頁',
    )
  })

  it('disables the final-page control when the adjacent chapter is inaccessible', () => {
    const { onNext } = renderPagedReader({
      canNavigateNextChapter: false,
    })
    const nextPage = screen.getByRole('button', { name: '下一頁' })

    expect(nextPage).not.toBeDisabled()
    fireEvent.click(nextPage)
    fireEvent.click(nextPage)

    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 3 / 3 頁',
    )
    expect(nextPage).toBeDisabled()

    fireEvent.click(nextPage)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('preserves live normalized progress through deterministic three-to-one-to-three page reflows', () => {
    const onProgressChange = vi.fn()
    const { reflowToWidth } = renderPagedReader({ onProgressChange })
    const nextPage = screen.getByRole('button', { name: '下一頁' })
    const progress = screen.getByRole('progressbar', {
      name: '本章閱讀進度',
    })

    fireEvent.click(nextPage)
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    onProgressChange.mockClear()

    reflowToWidth(300)
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 1 / 1 頁',
    )
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(onProgressChange).not.toHaveBeenCalled()

    reflowToWidth(900)
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 2 / 3 頁',
    )
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(onProgressChange).not.toHaveBeenCalled()

    fireEvent.click(nextPage)
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    onProgressChange.mockClear()

    reflowToWidth(300)
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(onProgressChange).not.toHaveBeenCalled()

    reflowToWidth(900)
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 3 / 3 頁',
    )
    expect(progress).toHaveAttribute('aria-valuenow', '100')
    expect(onProgressChange).not.toHaveBeenCalled()
  })

  it('keeps fresh one-page chapter progress at zero without persisting a synthetic update', () => {
    const { onProgressChange } = renderPagedReader({
      initialScrollWidth: 300,
    })

    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 1 / 1 頁',
    )
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '0')
    expect(onProgressChange).not.toHaveBeenCalled()
  })

  it('retains saved nonzero progress on one page and restores its nearest multi-page position', () => {
    const { onProgressChange, reflowToWidth } = renderPagedReader({
      openedChapter: {
        ...mockOpenedChapter,
        initialChapterProgress: 0.5,
      },
      initialScrollWidth: 300,
    })
    const progress = screen.getByRole('progressbar', {
      name: '本章閱讀進度',
    })

    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(onProgressChange).not.toHaveBeenCalled()

    reflowToWidth(900)
    expect(screen.getByRole('status', { name: '分頁位置' })).toHaveTextContent(
      '第 2 / 3 頁',
    )
    expect(progress).toHaveAttribute('aria-valuenow', '50')
    expect(onProgressChange).not.toHaveBeenCalled()
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
    initialChapterProgress: 0,
  }

  const lastChapter = {
    book: navBook,
    chapter: navBook.chapters[1],
    prose: ['Paragraph 2'],
    isLocked: false,
    hasPrevious: true,
    hasNext: false,
    initialChapterProgress: 0,
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
