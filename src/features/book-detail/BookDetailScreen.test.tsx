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
