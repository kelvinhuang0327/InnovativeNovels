import { cleanup, render, screen, fireEvent } from '@testing-library/react'
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
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
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
        onChangePreferences={onChangePreferences}
        onResetPreferences={onResetPreferences}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
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
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={onToggleBookmark}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
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
