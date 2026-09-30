import { useEffect, useRef } from 'react'
import type { BookmarkEntry } from '../../application/reading/readingUseCases'
import type { ReadingPosition } from '../../domain/reading/readingPosition'

interface ChapterBookmarksModalProps {
  readonly isOpen: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
  readonly onSelectBookmark: (position: ReadingPosition) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
}

export function ChapterBookmarksModal({
  isOpen,
  bookmarks,
  triggerRef,
  onClose,
  onSelectBookmark,
  onRemoveBookmark,
}: ChapterBookmarksModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const closeAndRestoreFocus = () => {
    onClose()
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeAndRestoreFocus()
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={closeAndRestoreFocus}
      data-testid="bookmarks-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="章節書籤"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2>章節書籤</h2>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉書籤"
            onClick={closeAndRestoreFocus}
          >
            關閉
          </button>
        </header>

        {bookmarks.length === 0 ? (
          <div className="bookmarks-empty-state" role="status">
            尚無書籤
          </div>
        ) : (
          <ul className="bookmarks-list" aria-label="已儲存的章節書籤">
            {bookmarks.map((entry) => (
              <li
                key={`${entry.book.book.id}:${entry.chapter.id}`}
                className="bookmark-item"
              >
                <div className="bookmark-info">
                  <span className="bookmark-book-title">
                    {entry.book.book.title}
                  </span>
                  <span className="bookmark-chapter-title">
                    {entry.chapter.title}
                  </span>
                </div>
                <div className="bookmark-actions">
                  <button
                    type="button"
                    className="button-primary"
                    onClick={() => {
                      onSelectBookmark(entry.position)
                      closeAndRestoreFocus()
                    }}
                  >
                    移至章節
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() =>
                      onRemoveBookmark(entry.book.book.id, entry.chapter.id)
                    }
                  >
                    移除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
