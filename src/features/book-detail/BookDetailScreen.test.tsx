import { render, screen, fireEvent, cleanup } from '@testing-library/react'
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
      id: chapterId('c1'),
      bookId: bookId('b1'),
      sequence: chapterSequence(1),
      title: '第一章 序幕',
      access: CHAPTER_ACCESS.READABLE,
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
      />,
    )

    const backBtn = screen.getByRole('button', { name: '返回書庫' })
    fireEvent.click(backBtn)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
