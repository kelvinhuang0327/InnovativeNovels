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
})
