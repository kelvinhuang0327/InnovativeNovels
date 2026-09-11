import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkEntry } from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { ChapterBookmarksModal } from './ChapterBookmarksModal'

const bookmarkBook = {
  book: {
    id: bookId('bookmark-book'),
    title: 'Bookmark Book',
    authorName: 'Author',
    categoryLabel: 'Fiction',
  },
  description: 'Description',
  chapters: [
    {
      id: chapterId('bookmark-chapter'),
      bookId: bookId('bookmark-book'),
      title: 'Bookmark Chapter',
      sequence: chapterSequence(1),
      access: CHAPTER_ACCESS.READABLE,
    },
  ],
}

const bookmark = {
  book: bookmarkBook,
  chapter: bookmarkBook.chapters[0],
  position: {
    bookId: bookmarkBook.book.id,
    chapterId: bookmarkBook.chapters[0].id,
    paragraphIndex: 0,
    chapterProgress: 0,
  },
} satisfies BookmarkEntry

interface HarnessProps {
  readonly bookmarks?: readonly BookmarkEntry[]
  readonly initiallyOpen?: boolean
  readonly onClose: () => void
  readonly onSelectBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
}

function Harness({
  bookmarks = [bookmark],
  initiallyOpen = true,
  onClose,
  onSelectBookmark,
  onRemoveBookmark,
}: HarnessProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setIsOpen(false)
    onClose()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        開啟書籤列表
      </button>
      <ChapterBookmarksModal
        isOpen={isOpen}
        bookmarks={bookmarks}
        triggerRef={triggerRef}
        onClose={close}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />
    </>
  )
}

function renderHarness(
  options: {
    bookmarks?: readonly BookmarkEntry[]
    initiallyOpen?: boolean
  } = {},
) {
  const onClose = vi.fn()
  const onSelectBookmark = vi.fn()
  const onRemoveBookmark = vi.fn()
  const view = render(
    <Harness
      {...options}
      onClose={onClose}
      onSelectBookmark={onSelectBookmark}
      onRemoveBookmark={onRemoveBookmark}
    />,
  )

  return { ...view, onClose, onSelectBookmark, onRemoveBookmark }
}

afterEach(() => {
  cleanup()
})

describe('ChapterBookmarksModal keyboard and focus behavior', () => {
  it('focuses the dialog on open without activating bookmark actions', () => {
    const { onSelectBookmark, onRemoveBookmark } = renderHarness({
      initiallyOpen: false,
    })
    const trigger = screen.getByRole('button', { name: '開啟書籤列表' })

    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '章節書籤' })
    expect(dialog).toHaveFocus()
    expect(onSelectBookmark).not.toHaveBeenCalled()
    expect(onRemoveBookmark).not.toHaveBeenCalled()
  })

  it('closes once on Escape and restores focus to the trigger', () => {
    const { onClose } = renderHarness({ initiallyOpen: false })
    const trigger = screen.getByRole('button', { name: '開啟書籤列表' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog', { name: '章節書籤' }), {
      key: 'Escape',
    })

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('dialog', { name: '章節書籤' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores focus after close-button and backdrop dismissal', () => {
    const { onClose } = renderHarness({ initiallyOpen: false })
    const trigger = screen.getByRole('button', { name: '開啟書籤列表' })

    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: '關閉書籤' }))
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByTestId('bookmarks-backdrop'))

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(trigger).toHaveFocus()
  })

  it('does not close when clicking inside the modal', () => {
    const { onClose } = renderHarness()
    const dialog = screen.getByRole('dialog', { name: '章節書籤' })

    fireEvent.click(within(dialog).getByRole('heading', { name: '章節書籤' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '章節書籤' })).toBeInTheDocument()
  })

  it('selects a bookmark once with the same IDs and closes the modal', () => {
    const { onClose, onSelectBookmark } = renderHarness()
    const dialog = screen.getByRole('dialog', { name: '章節書籤' })

    fireEvent.click(within(dialog).getByRole('button', { name: '移至章節' }))

    expect(onSelectBookmark).toHaveBeenCalledTimes(1)
    expect(onSelectBookmark).toHaveBeenCalledWith(
      bookmark.book.book.id,
      bookmark.chapter.id,
    )
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(
      screen.queryByRole('dialog', { name: '章節書籤' }),
    ).not.toBeInTheDocument()
  })

  it('removes a bookmark once without closing the modal', () => {
    const { onClose, onRemoveBookmark } = renderHarness()
    const dialog = screen.getByRole('dialog', { name: '章節書籤' })

    fireEvent.click(within(dialog).getByRole('button', { name: '移除' }))

    expect(onRemoveBookmark).toHaveBeenCalledTimes(1)
    expect(onRemoveBookmark).toHaveBeenCalledWith(
      bookmark.book.book.id,
      bookmark.chapter.id,
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: '章節書籤' })).toBeInTheDocument()
  })

  it('keeps the empty-bookmark state unchanged', () => {
    renderHarness({ bookmarks: [] })

    const dialog = screen.getByRole('dialog', { name: '章節書籤' })
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByRole('status')).toHaveTextContent('尚無書籤')
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()
  })
})
