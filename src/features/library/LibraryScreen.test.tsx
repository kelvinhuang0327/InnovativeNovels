import { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { RecentReadingEntry } from '../../application/library/libraryUseCases'
import type {
  BookmarkEntry,
  ChapterReadingNoteEntry,
  ContinueReadingEntry,
} from '../../application/reading/readingUseCases'
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

function makeBookmarkEntry(
  book: ContentBook,
  paragraphIndex: number,
  chapterProgress: number,
): BookmarkEntry {
  const chapter = book.chapters[0]

  return {
    book,
    chapter,
    position: {
      bookId: book.book.id,
      chapterId: chapter.id,
      paragraphIndex,
      chapterProgress,
    },
  }
}

function makeReadingNoteEntry(
  book: ContentBook,
  content: string,
): ChapterReadingNoteEntry {
  const chapter = book.chapters[0]

  return {
    book,
    chapter,
    note: {
      bookId: book.book.id,
      chapterId: chapter.id,
      content,
    },
  }
}

const baseProps = {
  books: [bookA],
  bookmarks: [] as readonly BookmarkEntry[],
  notes: [] as readonly ChapterReadingNoteEntry[],
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
  onOpenBookmark: vi.fn(),
  onRemoveBookmark: vi.fn(),
  onOpenReadingNote: vi.fn(),
  onRemoveReadingNote: vi.fn(),
  onRemoveFromBookshelf: vi.fn(),
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('LibraryScreen', () => {
  it('shows an unavailable export state without creating a download when nothing is saved', () => {
    const createObjectURL = vi.fn(() => 'blob:reading-data')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    render(
      <LibraryScreen
        {...baseProps}
        bookmarks={[]}
        notes={[]}
        recentReading={[]}
      />,
    )

    expect(
      screen.getByText('目前沒有可匯出的書籤或筆記。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '匯出書籤與筆記' }),
    ).not.toBeInTheDocument()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('exports all saved items as UTF-8 text when the filter is empty', async () => {
    const bookmark = makeBookmarkEntry(bookA, 2, 0.4)
    const noteContent = '第一行\n  第二行\n第三行'
    const note = makeReadingNoteEntry(bookB, noteContent)
    let downloadedFile: Blob | undefined
    const createObjectURL = vi.fn((file: Blob) => {
      downloadedFile = file
      return 'blob:reading-data'
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <LibraryScreen
        {...baseProps}
        bookmarks={[bookmark]}
        notes={[note]}
        recentReading={[]}
      />,
    )

    expect(createObjectURL).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '匯出書籤與筆記' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text/plain;charset=utf-8' }),
    )
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)

    const exportedText = await downloadedFile?.text()
    expect(exportedText).toContain(`bookId：${bookmark.position.bookId}`)
    expect(exportedText).toContain(`chapterId：${bookmark.position.chapterId}`)
    expect(exportedText).toContain('paragraphIndex：2')
    expect(exportedText).toContain('chapterProgress：0.4')
    expect(exportedText).toContain(`筆記內容：\n${noteContent}\n—— 筆記結束 ——`)
  })

  it('exports only the bookmarks and notes visible under the saved-item filter', async () => {
    const savedBook = makeBook('saved-export-silver', 'Silver Orchard')
    const savedChapter = {
      ...savedBook.chapters[0],
      title: 'The Glass Harbor',
    }
    const otherBook = makeBook('saved-export-copper', 'Copper Station')
    const otherChapter = {
      ...otherBook.chapters[0],
      title: 'The Last Train',
    }
    const savedBookmark = {
      ...makeBookmarkEntry(savedBook, 4, 0.37),
      chapter: savedChapter,
    }
    const otherBookmark = {
      ...makeBookmarkEntry(otherBook, 2, 0.81),
      chapter: otherChapter,
    }
    const savedNoteContent = '第一行保留\n  第二行保留縮排\n第三行'
    const savedNote = {
      ...makeReadingNoteEntry(savedBook, savedNoteContent),
      chapter: savedChapter,
    }
    const otherNote = {
      ...makeReadingNoteEntry(otherBook, '不應匯出的筆記'),
      chapter: otherChapter,
    }
    let downloadedFile: Blob | undefined
    const createObjectURL = vi.fn((file: Blob) => {
      downloadedFile = file
      return 'blob:reading-data'
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <LibraryScreen
        {...baseProps}
        bookmarks={[savedBookmark, otherBookmark]}
        notes={[savedNote, otherNote]}
        recentReading={[]}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋已保存內容' }), {
      target: { value: '  sIlVeR  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '匯出書籤與筆記' }))

    const exportedText = await downloadedFile?.text()
    expect(exportedText).toContain('章節書籤（1）')
    expect(exportedText).toContain('章節筆記（1）')
    expect(exportedText).toContain('書名：Silver Orchard')
    expect(exportedText).not.toContain('Copper Station')
    expect(exportedText).not.toContain('不應匯出的筆記')
    expect(exportedText).toContain(`bookId：${savedBookmark.position.bookId}`)
    expect(exportedText).toContain(`chapterId：${savedBookmark.position.chapterId}`)
    expect(exportedText).toContain('paragraphIndex：4')
    expect(exportedText).toContain('chapterProgress：0.37')
    expect(exportedText).toContain(
      `筆記內容：\n${savedNoteContent}\n—— 筆記結束 ——`,
    )
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  })

  it('shows an unavailable state and creates no download when the filter matches nothing', () => {
    const createObjectURL = vi.fn(() => 'blob:reading-data')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(
      <LibraryScreen
        {...baseProps}
        bookmarks={[makeBookmarkEntry(bookA, 2, 0.4)]}
        notes={[makeReadingNoteEntry(bookB, '第二章筆記')]}
        recentReading={[]}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋已保存內容' }), {
      target: { value: 'no saved item matches this' },
    })

    expect(
      screen.getByText('目前沒有符合搜尋條件可匯出的書籤或筆記。'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '匯出書籤與筆記' }),
    ).not.toBeInTheDocument()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })

  it('shows the chapter-notes empty state between bookmarks and the bookshelf', () => {
    const { container } = render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        bookmarks={[]}
        notes={[]}
        recentReading={[]}
      />,
    )

    const notesSection = screen.getByRole('region', { name: '章節筆記' })
    expect(within(notesSection).getByRole('heading', { name: '章節筆記' })).toBeInTheDocument()
    expect(within(notesSection).getByText('0 則')).toBeInTheDocument()
    expect(within(notesSection).getByRole('status')).toHaveTextContent(
      '還沒有章節筆記。',
    )
    expect(within(notesSection).queryByRole('list')).not.toBeInTheDocument()

    expect(
      Array.from(container.querySelectorAll('.library-section')).map((section) =>
        section.getAttribute('aria-labelledby'),
      ),
    ).toEqual([
      'bookmarks-heading',
      'reading-notes-heading',
      'bookshelf-heading',
      'recent-reading-heading',
    ])
  })

  it('renders plain-text notes from books outside the shelf and exposes note actions', () => {
    const content = '<img src="unsafe" onerror="alert(1)">\n第二行筆記'
    const entry = makeReadingNoteEntry(
      bookB,
      content,
    )
    const onOpenReadingNote = vi.fn()
    const onRemoveReadingNote = vi.fn()

    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        bookmarks={[]}
        notes={[entry]}
        recentReading={[]}
        onOpenReadingNote={onOpenReadingNote}
        onRemoveReadingNote={onRemoveReadingNote}
      />,
    )

    const notesSection = screen.getByRole('region', { name: '章節筆記' })
    const item = within(notesSection).getByRole('listitem')

    expect(within(item).getByRole('heading', { name: '山中劍客' })).toBeInTheDocument()
    expect(within(item).getByText('山中劍客 第一章')).toBeInTheDocument()
    expect(
      item.querySelector('.library-reading-note-content')?.textContent,
    ).toBe(content)
    expect(within(item).queryByRole('img')).not.toBeInTheDocument()

    fireEvent.click(within(item).getByRole('button', { name: '移至章節' }))
    expect(onOpenReadingNote).toHaveBeenCalledWith(
      bookB.book.id,
      bookB.chapters[0].id,
    )

    fireEvent.click(within(item).getByRole('button', { name: '移除' }))
    expect(onRemoveReadingNote).toHaveBeenCalledWith(
      bookB.book.id,
      bookB.chapters[0].id,
    )
  })

  it('renders the empty state immediately after the last note is removed', () => {
    const note = makeReadingNoteEntry(bookA, '第一章筆記')
    const onRemoveReadingNote = vi.fn()

    function ControlledLibrary() {
      const [visibleNotes, setVisibleNotes] = useState([note])

      return (
        <LibraryScreen
          {...baseProps}
          books={[]}
          bookmarks={[]}
          notes={visibleNotes}
          recentReading={[]}
          onRemoveReadingNote={(requestedBookId, requestedChapterId) => {
            onRemoveReadingNote(requestedBookId, requestedChapterId)
            setVisibleNotes((current) =>
              current.filter(
                (entry) =>
                  entry.book.book.id !== requestedBookId ||
                  entry.chapter.id !== requestedChapterId,
              ),
            )
          }}
        />
      )
    }

    render(<ControlledLibrary />)

    const notesSection = screen.getByRole('region', { name: '章節筆記' })
    fireEvent.click(
      within(notesSection).getByRole('button', { name: '移除' }),
    )

    expect(onRemoveReadingNote).toHaveBeenCalledWith(
      bookA.book.id,
      bookA.chapters[0].id,
    )
    expect(within(notesSection).getByText('0 則')).toBeInTheDocument()
    expect(within(notesSection).getByRole('status')).toHaveTextContent(
      '還沒有章節筆記。',
    )
    expect(within(notesSection).queryByRole('list')).not.toBeInTheDocument()
  })

  it('renders all supplied bookmarks independently of the shelf and opens the exact saved position', () => {
    const bookmarks = [
      makeBookmarkEntry(bookB, 2, 0.425),
      makeBookmarkEntry(bookA, 3, 0.73),
    ]
    const onOpenBookmark = vi.fn()

    render(
      <LibraryScreen
        {...baseProps}
        books={[]}
        bookmarks={bookmarks}
        recentReading={[]}
        onOpenBookmark={onOpenBookmark}
      />,
    )

    const bookmarkSection = screen.getByRole('region', {
      name: '章節書籤',
    })
    const bookmarkItems = within(bookmarkSection).getAllByRole('listitem')

    expect(bookmarkItems).toHaveLength(2)
    expect(
      bookmarkItems.map((item) => within(item).getByRole('heading').textContent),
    ).toEqual(['山中劍客', '海邊書店'])
    expect(within(bookmarkItems[0]).getByText('山中劍客 第一章')).toBeInTheDocument()
    expect(within(bookmarkItems[1]).getByText('海邊書店 第一章')).toBeInTheDocument()

    fireEvent.click(
      within(bookmarkItems[0]).getByRole('button', { name: '移至章節' }),
    )

    expect(onOpenBookmark).toHaveBeenCalledTimes(1)
    expect(onOpenBookmark).toHaveBeenCalledWith(bookmarks[0].position)
  })

  it('filters saved bookmarks and notes by trimmed, case-insensitive titles and note content', () => {
    const savedBook = makeBook('saved-search-silver', 'Silver Orchard')
    const savedChapter = {
      ...savedBook.chapters[0],
      title: 'The Glass Harbor',
    }
    const otherBook = makeBook('saved-search-copper', 'Copper Station')
    const otherChapter = {
      ...otherBook.chapters[0],
      title: 'The Last Train',
    }
    const savedBookmark = {
      ...makeBookmarkEntry(savedBook, 4, 0.37),
      chapter: savedChapter,
    }
    const otherBookmark = {
      ...makeBookmarkEntry(otherBook, 2, 0.81),
      chapter: otherChapter,
    }
    const savedNote = {
      ...makeReadingNoteEntry(savedBook, 'A QUIET voice by the sea.'),
      chapter: savedChapter,
    }
    const otherNote = {
      ...makeReadingNoteEntry(otherBook, 'The train left at midnight.'),
      chapter: otherChapter,
    }
    const onOpenBookmark = vi.fn()
    const onRemoveBookmark = vi.fn()
    const onOpenReadingNote = vi.fn()
    const onRemoveReadingNote = vi.fn()

    render(
      <LibraryScreen
        {...baseProps}
        books={[bookB]}
        bookmarks={[savedBookmark, otherBookmark]}
        notes={[savedNote, otherNote]}
        recentReading={[]}
        onOpenBookmark={onOpenBookmark}
        onRemoveBookmark={onRemoveBookmark}
        onOpenReadingNote={onOpenReadingNote}
        onRemoveReadingNote={onRemoveReadingNote}
      />,
    )

    const search = screen.getByRole('searchbox', { name: '搜尋已保存內容' })
    const bookmarkSection = screen.getByRole('region', { name: '章節書籤' })
    const notesSection = screen.getByRole('region', { name: '章節筆記' })

    expect(search).toHaveValue('')
    expect(within(bookmarkSection).getByText('2 個')).toBeInTheDocument()
    expect(within(bookmarkSection).getAllByRole('listitem')).toHaveLength(2)
    expect(within(notesSection).getByText('2 則')).toBeInTheDocument()
    expect(within(notesSection).getAllByRole('listitem')).toHaveLength(2)

    fireEvent.change(search, { target: { value: '   ' } })

    expect(within(bookmarkSection).getAllByRole('listitem')).toHaveLength(2)
    expect(within(notesSection).getAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: '清除搜尋' }),
    ).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '  sIlVeR  ' } })

    expect(within(bookmarkSection).getByText('1 / 2 個')).toBeInTheDocument()
    expect(within(notesSection).getByText('1 / 2 則')).toBeInTheDocument()
    const bookmarkItem = within(bookmarkSection).getByRole('listitem')
    const noteItem = within(notesSection).getByRole('listitem')
    expect(within(bookmarkItem).getByRole('heading', { name: 'Silver Orchard' })).toBeInTheDocument()
    expect(within(noteItem).getByRole('heading', { name: 'Silver Orchard' })).toBeInTheDocument()

    fireEvent.click(
      within(bookmarkItem).getByRole('button', { name: '移至章節' }),
    )
    fireEvent.click(within(bookmarkItem).getByRole('button', { name: '移除' }))
    fireEvent.click(within(noteItem).getByRole('button', { name: '移至章節' }))
    fireEvent.click(within(noteItem).getByRole('button', { name: '移除' }))

    expect(onOpenBookmark).toHaveBeenCalledWith(savedBookmark.position)
    expect(onRemoveBookmark).toHaveBeenCalledWith(
      savedBook.book.id,
      savedChapter.id,
    )
    expect(onOpenReadingNote).toHaveBeenCalledWith(
      savedBook.book.id,
      savedChapter.id,
    )
    expect(onRemoveReadingNote).toHaveBeenCalledWith(
      savedBook.book.id,
      savedChapter.id,
    )

    fireEvent.change(search, { target: { value: '  gLaSs  ' } })

    expect(within(bookmarkSection).getAllByRole('listitem')).toHaveLength(1)
    expect(within(notesSection).getAllByRole('listitem')).toHaveLength(1)
    expect(within(bookmarkSection).getByText('The Glass Harbor')).toBeInTheDocument()
    expect(within(notesSection).getByText('The Glass Harbor')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: '  qUiEt  ' } })

    expect(within(bookmarkSection).getByRole('status')).toHaveTextContent(
      '找不到符合條件的章節書籤',
    )
    expect(within(notesSection).getAllByRole('listitem')).toHaveLength(1)
    expect(within(notesSection).getByText('A QUIET voice by the sea.')).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'no saved item matches this' } })

    expect(within(bookmarkSection).getByRole('heading', { name: '章節書籤' })).toBeInTheDocument()
    expect(within(notesSection).getByRole('heading', { name: '章節筆記' })).toBeInTheDocument()
    expect(within(bookmarkSection).getByRole('status')).toHaveTextContent(
      '找不到符合條件的章節書籤',
    )
    expect(within(notesSection).getByRole('status')).toHaveTextContent(
      '找不到符合條件的章節筆記',
    )
    expect(
      within(screen.getByRole('region', { name: '我的書架' })).getByText('山中劍客'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清除搜尋' }))

    expect(search).toHaveValue('')
    expect(within(bookmarkSection).getByText('2 個')).toBeInTheDocument()
    expect(within(bookmarkSection).getAllByRole('listitem')).toHaveLength(2)
    expect(within(notesSection).getByText('2 則')).toBeInTheDocument()
    expect(within(notesSection).getAllByRole('listitem')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: '清除搜尋' }),
    ).not.toBeInTheDocument()
  })

