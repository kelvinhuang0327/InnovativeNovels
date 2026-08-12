import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { RecentReadingEntry } from '../../application/library/libraryUseCases'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { LibraryScreen } from './LibraryScreen'

function makeBook(id: string, title: string): ContentBook {
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
      authorName: '作者',
      categoryLabel: '分類',
    },
    description: '故事簡介',
    chapters: [chapter],
  }
}

const bookA = makeBook('book-a', '海邊書店')
const bookB = makeBook('book-b', '山中劍客')

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

  it('returns to Bookstore', () => {
    render(<LibraryScreen {...baseProps} />)

    fireEvent.click(screen.getByRole('button', { name: '返回書城' }))

    expect(baseProps.onBackToBookstore).toHaveBeenCalledOnce()
  })
})
