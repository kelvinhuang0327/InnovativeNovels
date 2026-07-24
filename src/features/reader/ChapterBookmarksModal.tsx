import type { BookmarkEntry } from '../../application/reading/readingUseCases'

interface ChapterBookmarksModalProps {
  readonly isOpen: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly onClose: () => void
  readonly onSelectBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
}

export function ChapterBookmarksModal({
  isOpen,
  bookmarks,
  onClose,
  onSelectBookmark,
  onRemoveBookmark,
}: ChapterBookmarksModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="bookmarks-backdrop">
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="章節書籤"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>章節書籤</h2>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉書籤"
            onClick={onClose}
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
                      onSelectBookmark(entry.book.book.id, entry.chapter.id)
                      onClose()
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
