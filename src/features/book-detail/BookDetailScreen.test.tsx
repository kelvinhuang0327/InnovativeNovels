import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import type { ContentBook } from '../../application/catalog/contentRepository'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { BookDetailScreen } from './BookDetailScreen'

afterEach(() => {
  cleanup()
})

const mockBook: ContentBook = {
  book: {
    id: bookId('b1'),
    title: '風雲帝國',
    authorName: '張三',
    categoryLabel: '玄幻',
  },
  description: '精彩小說內文簡介',
  chapters: [
    {
      id: chapterId('c4'),
      bookId: bookId('b1'),
      sequence: chapterSequence(4),
      title: '第四章 禁地',
      access: CHAPTER_ACCESS.LOCKED,
    },
    {
      id: chapterId('c1'),
      bookId: bookId('b1'),
      sequence: chapterSequence(1),
      title: '第一章 序幕',
      access: CHAPTER_ACCESS.READABLE,
    },
    {
      id: chapterId('c3'),
      bookId: bookId('b1'),
      sequence: chapterSequence(3),
      title: '第三章 試讀',
      access: CHAPTER_ACCESS.PREVIEW,
    },
    {
      id: chapterId('c5'),
      bookId: bookId('b1'),
      sequence: chapterSequence(5),
      title: '第五章 待定',
      access: CHAPTER_ACCESS.UNAVAILABLE,
    },
    {
      id: chapterId('c2'),
      bookId: bookId('b1'),
      sequence: chapterSequence(2),
      title: '第二章 風起雲湧',
      access: CHAPTER_ACCESS.READABLE,
    },
  ],
}

describe('BookDetailScreen chapter directory search', () => {
  const orderedTitles = [
    '第一章 序幕',
    '第二章 風起雲湧',
    '第三章 試讀',
    '第四章 禁地',
    '第五章 待定',
  ]

  function renderDirectory(book = mockBook) {
    const callbacks = {
      onBack: vi.fn(),
      onRead: vi.fn(),
      onReadChapter: vi.fn(),
      onToggleBookshelf: vi.fn(),
    }
    const view = render(
      <BookDetailScreen
        book={book}
        hasSavedPosition={true}
        continueChapterId="c2"
        continueChapterTitle="第二章 風起雲湧"
        continueChapterProgress={0.456}
        isInBookshelf={true}
        {...callbacks}
      />,
    )
    const directory = screen.getByRole('region', { name: '章節目錄' })

    return {
      ...view,
      ...callbacks,
      directory,
      search: within(directory).getByRole('searchbox', { name: '搜尋章節' }),
      list: within(directory).getByRole('list', { name: '章節預覽列表' }),
    }
  }

  function visibleTitles(list: HTMLElement) {
    return within(list).queryAllByRole('listitem').map(
      (item) => item.querySelector('.book-chapter-title')?.textContent,
    )
  }

  it('shows every chapter in sequence for empty and whitespace-only queries', () => {
    const { directory, search, list } = renderDirectory()

    expect(search).toHaveValue('')
    expect(visibleTitles(list)).toEqual(orderedTitles)
    expect(within(directory).queryByRole('button', { name: '清除搜尋' }))
      .not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '  \t  ' } })

    expect(visibleTitles(list)).toEqual(orderedTitles)
    expect(within(directory).queryByRole('status')).not.toBeInTheDocument()
    expect(within(directory).queryByRole('button', { name: '清除搜尋' }))
      .not.toBeInTheDocument()
  })

  it.each(['起雲', '  起雲 \t '])(
    'matches a Chinese title substring with query %j and hides other chapters',
    (query) => {
      const { search, list } = renderDirectory()

      fireEvent.change(search, { target: { value: query } })

      expect(visibleTitles(list)).toEqual(['第二章 風起雲湧'])
      expect(within(list).getByText('第 2 章')).toBeInTheDocument()
    },
  )

  it.each(['dAwN', '  DAWN \t '])(
    'matches English titles case-insensitively with query %j without reordering matches',
    (query) => {
      const englishBook: ContentBook = {
        ...mockBook,
        chapters: mockBook.chapters.map((chapter) => ({
          ...chapter,
          title: chapter.id === 'c1'
            ? 'The Dawn Begins'
            : chapter.id === 'c4'
              ? 'A DAWN Returns'
              : chapter.title,
        })),
      }
      const { search, list } = renderDirectory(englishBook)

      fireEvent.change(search, { target: { value: query } })

      expect(visibleTitles(list)).toEqual(['The Dawn Begins', 'A DAWN Returns'])
      expect(within(list).getAllByRole('listitem').map(
        (item) => item.querySelector('.book-chapter-sequence')?.textContent,
      )).toEqual(['第 1 章', '第 4 章'])
    },
  )

  it('matches titles only and reports no results as a distinct status', () => {
    const { directory, search, list } = renderDirectory()

    for (const query of ['不存在', 'c2', '第 2 章', '已鎖定', '風雲帝國', '張三', '玄幻', '精彩小說']) {
      fireEvent.change(search, { target: { value: query } })

      expect(visibleTitles(list)).toEqual([])
      expect(within(directory).getByRole('status')).toHaveTextContent('沒有符合的章節')
      expect(within(directory).queryByRole('alert')).not.toBeInTheDocument()
    }

    fireEvent.change(search, { target: { value: '序幕' } })

    expect(visibleTitles(list)).toEqual(['第一章 序幕'])
    expect(within(directory).queryByRole('status')).not.toBeInTheDocument()
  })

  it('clears matching and empty results without changing summaries, saved progress, or callbacks', () => {
    const originalBook = structuredClone(mockBook)
    const { directory, search, list, onRead, onReadChapter, onBack, onToggleBookshelf } =
      renderDirectory()

    function expectBookStateUnchanged() {
      expect(screen.getByText('5 章', { selector: 'dd' })).toBeInTheDocument()
      expect(screen.getByText('3 章', { selector: 'dd' })).toBeInTheDocument()
      expect(within(directory).getByText('共 5 章')).toBeInTheDocument()
      expect(screen.getByText('目前可連續閱讀前 3 章')).toBeInTheDocument()
      expect(screen.getByText('目前讀到：第二章 風起雲湧')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: '本章進度 46%' }))
        .toHaveAttribute('value', '46')
      expect(screen.getByRole('button', { name: '繼續閱讀：第二章 風起雲湧' }))
        .toBeInTheDocument()
      expect(screen.getByRole('button', { name: '移出書架' }))
        .toHaveAttribute('aria-pressed', 'true')
      expect(onRead).not.toHaveBeenCalled()
      expect(onReadChapter).not.toHaveBeenCalled()
      expect(onBack).not.toHaveBeenCalled()
      expect(onToggleBookshelf).not.toHaveBeenCalled()
      expect(mockBook).toEqual(originalBook)
    }

    for (const query of ['起雲', '不存在']) {
      fireEvent.change(search, { target: { value: query } })
      expectBookStateUnchanged()

      fireEvent.click(within(directory).getByRole('button', { name: '清除搜尋' }))

      expect(search).toHaveValue('')
      expect(visibleTitles(list)).toEqual(orderedTitles)
      expect(within(directory).queryByRole('status')).not.toBeInTheDocument()
      expect(within(directory).queryByRole('button', { name: '清除搜尋' }))
        .not.toBeInTheDocument()
      expectBookStateUnchanged()
    }
  })

  it('preserves the continue marker and aria-current only on the saved chapter', () => {
    const { directory, search, list } = renderDirectory()

    fireEvent.change(search, { target: { value: '起雲' } })

    const currentChapter = within(list).getByRole('listitem')
    expect(currentChapter).toHaveAttribute('aria-current', 'true')
    expect(currentChapter).toHaveClass('is-continue')
    expect(within(currentChapter).getByText('目前閱讀進度')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '序幕' } })

    expect(within(list).getByRole('listitem')).not.toHaveAttribute('aria-current')
    expect(within(list).queryByText('目前閱讀進度')).not.toBeInTheDocument()

    fireEvent.click(within(directory).getByRole('button', { name: '清除搜尋' }))

    const restoredChapter = within(list).getAllByRole('listitem')[1]
    expect(restoredChapter).toHaveAttribute('aria-current', 'true')
    expect(restoredChapter).toHaveTextContent('第二章 風起雲湧')
    expect(within(list).getAllByText('目前閱讀進度')).toHaveLength(1)
    expect(list.querySelectorAll('[aria-current]')).toHaveLength(1)
  })

  it.each([
    ['禁地', '第四章 禁地', '第 4 章', '已鎖定', CHAPTER_ACCESS.LOCKED],
    ['待定', '第五章 待定', '第 5 章', '暫不可用', CHAPTER_ACCESS.UNAVAILABLE],
  ])('preserves non-openable chapter semantics when searching for %s', (query, title, sequence, label, access) => {
    const { search, list, onReadChapter } = renderDirectory()

    fireEvent.change(search, { target: { value: query } })

    const chapter = within(list).getByRole('listitem')
    expect(chapter).toHaveAttribute('data-access', access)
    expect(chapter).not.toHaveAttribute('aria-current')
    expect(within(chapter).getByText(title)).toBeInTheDocument()
    expect(within(chapter).getByText(sequence)).toBeInTheDocument()
    expect(within(chapter).getByText(label)).toBeInTheDocument()
    expect(within(chapter).queryByRole('button')).not.toBeInTheDocument()
    fireEvent.click(chapter)
    expect(onReadChapter).not.toHaveBeenCalled()
  })

  it.each([
    ['序幕', '閱讀本章：第一章 序幕（可閱讀）', 'c1'],
    ['試讀', '開始試閱：第三章 試讀（試閱）', 'c3'],
  ])('opens the exact matching chapter once after searching for %s', (query, buttonName, id) => {
    const { search, list, onReadChapter, onRead } = renderDirectory()

    fireEvent.change(search, { target: { value: query } })
    expect(onReadChapter).not.toHaveBeenCalled()
    fireEvent.click(within(list).getByRole('button', { name: buttonName }))

    expect(onReadChapter).toHaveBeenCalledExactlyOnceWith(id)
    expect(onRead).not.toHaveBeenCalled()
  })

  it('discards the local query when leaving and reopening Book Detail', () => {
    const { search, unmount, onBack } = renderDirectory()

    fireEvent.change(search, { target: { value: '起雲' } })
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    expect(onBack).toHaveBeenCalledOnce()
    unmount()

    const reopened = renderDirectory()
    expect(reopened.search).toHaveValue('')
    expect(visibleTitles(reopened.list)).toEqual(orderedTitles)
  })
})

describe('BookDetailScreen Exit & Resume Continuity UI', () => {
  it('renders the factual hero identity and synopsis with readable depth fact and summary', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: '風雲帝國' }),
    ).toBeInTheDocument()
    expect(screen.getByText('類型')).toBeInTheDocument()
    expect(screen.getByText('玄幻', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('張三', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('5 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('3 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('目前可連續閱讀前 3 章')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '作品簡介' })).toBeInTheDocument()
    expect(screen.getByText('精彩小說內文簡介')).toBeInTheDocument()
  })


  it('renders Start Reading button when no saved position exists', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const readBtn = screen.getByRole('button', { name: '開始閱讀' })
    expect(readBtn).toBeInTheDocument()
    expect(screen.queryByText(/本章進度/)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('renders an accessible add-to-bookshelf action and toggles it', () => {
    const onToggleBookshelf = vi.fn()
    const { rerender } = render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        isInBookshelf={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
        onToggleBookshelf={onToggleBookshelf}
      />,
    )

    const addButton = screen.getByRole('button', { name: '加入書架' })
    expect(addButton).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(addButton)

    rerender(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        isInBookshelf={true}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
        onToggleBookshelf={onToggleBookshelf}
      />,
    )

    expect(screen.getByRole('button', { name: '移出書架' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(onToggleBookshelf).toHaveBeenCalledOnce()
  })

  it('renders chapter-aware Continue Reading button copy when valid saved position exists', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={true}
        continueChapterTitle="第二章 風起雲湧"
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const readBtn = screen.getByRole('button', {
      name: '繼續閱讀：第二章 風起雲湧',
    })
    expect(readBtn).toBeInTheDocument()
    expect(readBtn).toHaveTextContent('繼續閱讀：第二章 風起雲湧')
  })

  it.each([
    [0, 0],
    [0.456, 46],
    [1, 100],
    [-0.25, 0],
    [1.25, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])(
    'normalizes saved chapter progress %s to %s%% with accessible semantics',
    (chapterProgress, expectedProgress) => {
      render(
        <BookDetailScreen
          book={mockBook}
          hasSavedPosition={true}
          continueChapterTitle="第二章 風起雲湧"
          continueChapterProgress={chapterProgress}
          onBack={vi.fn()}
          onRead={vi.fn()}
          onReadChapter={vi.fn()}
        />,
      )

      expect(
        screen.getByText(`目前讀到：第二章 風起雲湧`),
      ).toBeInTheDocument()
      expect(
        screen.getByText(`本章進度 ${expectedProgress}%`),
      ).toBeInTheDocument()

      const progress = screen.getByRole('progressbar', {
        name: `本章進度 ${expectedProgress}%`,
      })
      expect(progress).toHaveAccessibleName(`本章進度 ${expectedProgress}%`)
      expect(progress).toHaveAttribute('aria-valuemin', '0')
      expect(progress).toHaveAttribute('max', '100')
      expect(progress).toHaveAttribute('value', String(expectedProgress))
    },
  )

  it('keeps the saved-position fallback while showing chapter progress', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={true}
        continueChapterProgress={0.25}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    expect(screen.getByText('這本書已有閱讀進度')).toBeInTheDocument()
    expect(screen.getByText('本章進度 25%')).toBeInTheDocument()
  })

  it('renders accessible session-only return status alert when present', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={true}
        continueChapterTitle="第二章 風起雲湧"
        sessionReturnStatus="閱讀位置已保留在 第二章 風起雲湧"
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const statusAlert = screen.getByRole('status')
    expect(statusAlert).toBeInTheDocument()
    expect(statusAlert).toHaveAttribute('aria-live', 'polite')
    expect(statusAlert).toHaveTextContent('閱讀位置已保留在 第二章 風起雲湧')
  })

  it('triggers onRead when read button is clicked', () => {
    const onRead = vi.fn()
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={true}
        continueChapterTitle="第二章 風起雲湧"
        onBack={vi.fn()}
        onRead={onRead}
        onReadChapter={vi.fn()}
      />,
    )

    const readBtn = screen.getByRole('button', {
      name: '繼續閱讀：第二章 風起雲湧',
    })
    fireEvent.click(readBtn)
    expect(onRead).toHaveBeenCalledTimes(1)
  })

  it('triggers onBack when return to library button is clicked', () => {
    const onBack = vi.fn()
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={onBack}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const backBtn = screen.getByRole('button', { name: '返回書庫' })
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders chapter identity and titles in exact sequence order', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const list = screen.getByRole('list', { name: '章節預覽列表' })
    const items = within(list).getAllByRole('listitem')

    expect(items.map((item) => item.querySelector('.book-chapter-title')?.textContent))
      .toEqual([
        '第一章 序幕',
        '第二章 風起雲湧',
        '第三章 試讀',
        '第四章 禁地',
        '第五章 待定',
      ])
    expect(items.map((item) => item.querySelector('.book-chapter-sequence')?.textContent))
      .toEqual(['第 1 章', '第 2 章', '第 3 章', '第 4 章', '第 5 章'])
  })

  it('uses policy access labels and only renders controls for openable chapters', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const readableItem = screen.getByText('第一章 序幕').closest('li')
    const previewItem = screen.getByText('第三章 試讀').closest('li')
    const lockedItem = screen.getByText('第四章 禁地').closest('li')
    const unavailableItem = screen.getByText('第五章 待定').closest('li')

    expect(readableItem).not.toBeNull()
    expect(previewItem).not.toBeNull()
    expect(lockedItem).not.toBeNull()
    expect(unavailableItem).not.toBeNull()
    expect(within(readableItem as HTMLElement).getByText('可閱讀')).toBeInTheDocument()
    expect(
      within(readableItem as HTMLElement).getByRole('button', {
        name: '閱讀本章：第一章 序幕（可閱讀）',
      }),
    ).toBeInTheDocument()
    expect(within(previewItem as HTMLElement).getByText('試閱')).toBeInTheDocument()
    expect(
      within(previewItem as HTMLElement).getByRole('button', {
        name: '開始試閱：第三章 試讀（試閱）',
      }),
    ).toBeInTheDocument()
    expect(within(lockedItem as HTMLElement).getByText('已鎖定')).toBeInTheDocument()
    expect(within(lockedItem as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(unavailableItem as HTMLElement).getByText('暫不可用'),
    ).toBeInTheDocument()
    expect(
      within(unavailableItem as HTMLElement).queryByRole('button'),
    ).not.toBeInTheDocument()
  })

  it.each([
    ['閱讀本章：第一章 序幕（可閱讀）', 'c1'],
    ['開始試閱：第三章 試讀（試閱）', 'c3'],
  ])('activates the exact allowed chapter through %s', (buttonName, id) => {
    const onReadChapter = vi.fn()
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={onReadChapter}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: buttonName }))

    expect(onReadChapter).toHaveBeenCalledTimes(1)
    expect(onReadChapter).toHaveBeenCalledWith(id)
  })

  it('identifies the saved Continue chapter without changing the primary action', () => {
    render(
      <BookDetailScreen
        book={mockBook}
        hasSavedPosition={true}
        continueChapterId="c2"
        continueChapterTitle="第二章 風起雲湧"
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    const continueItem = screen.getByText('第二章 風起雲湧').closest('li')

    expect(continueItem).toHaveAttribute('aria-current', 'true')
    expect(
      within(continueItem as HTMLElement).getByText('目前閱讀進度'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: '繼續閱讀：第二章 風起雲湧',
      }),
    ).toBeInTheDocument()
  })

  it('renders all-openable book depth presentation accurately', () => {
    const allOpenableBook: ContentBook = {
      book: {
        id: bookId('b-full'),
        title: '潮汐檔案',
        authorName: '沈墨',
        categoryLabel: '懸疑',
      },
      description: '全書開放閱讀。',
      chapters: [
        {
          id: chapterId('f1'),
          bookId: bookId('b-full'),
          sequence: chapterSequence(1),
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('f2'),
          bookId: bookId('b-full'),
          sequence: chapterSequence(2),
          title: '第二章',
          access: CHAPTER_ACCESS.READABLE,
        },
      ],
    }

    render(
      <BookDetailScreen
        book={allOpenableBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    expect(screen.getByText('章節', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('可閱讀', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getAllByText('2 章', { selector: 'dd' })).toHaveLength(2)
    expect(screen.getByText('目前 2 章皆可閱讀')).toBeInTheDocument()
  })



  it('renders contiguous-partial reading depth summary accurately', () => {
    const contiguousBook: ContentBook = {
      book: {
        id: bookId('b-contiguous'),
        title: '連續部分開放之書',
        authorName: '岑海',
        categoryLabel: '仙俠',
      },
      description: '前兩章開放第三章鎖定。',
      chapters: [
        {
          id: chapterId('c1'),
          bookId: bookId('b-contiguous'),
          sequence: chapterSequence(1),
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('c2'),
          bookId: bookId('b-contiguous'),
          sequence: chapterSequence(2),
          title: '第二章',
          access: CHAPTER_ACCESS.PREVIEW,
        },
        {
          id: chapterId('c3'),
          bookId: bookId('b-contiguous'),
          sequence: chapterSequence(3),
          title: '第三章',
          access: CHAPTER_ACCESS.LOCKED,
        },
      ],
    }

    render(
      <BookDetailScreen
        book={contiguousBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    expect(screen.getByText('3 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('2 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('目前可連續閱讀前 2 章')).toBeInTheDocument()
  })

  it('does not make false continuous depth claim when accessibility gap exists', () => {
    const gapBook: ContentBook = {
      book: {
        id: bookId('b-gap'),
        title: '跳章開放之書',
        authorName: '林晚',
        categoryLabel: '都市',
      },
      description: '第一章開放第二章鎖定第三章開放。',
      chapters: [
        {
          id: chapterId('g1'),
          bookId: bookId('b-gap'),
          sequence: chapterSequence(1),
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
        },
        {
          id: chapterId('g2'),
          bookId: bookId('b-gap'),
          sequence: chapterSequence(2),
          title: '第二章',
          access: CHAPTER_ACCESS.LOCKED,
        },
        {
          id: chapterId('g3'),
          bookId: bookId('b-gap'),
          sequence: chapterSequence(3),
          title: '第三章',
          access: CHAPTER_ACCESS.READABLE,
        },
      ],
    }

    render(
      <BookDetailScreen
        book={gapBook}
        hasSavedPosition={false}
        onBack={vi.fn()}
        onRead={vi.fn()}
        onReadChapter={vi.fn()}
      />,
    )

    expect(screen.getByText('3 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('2 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('目前有 2 章可閱讀')).toBeInTheDocument()
    expect(screen.queryByText(/可讀至第 3 章/)).not.toBeInTheDocument()
    expect(screen.queryByText(/目前可連續閱讀前 3 章/)).not.toBeInTheDocument()
  })
})
