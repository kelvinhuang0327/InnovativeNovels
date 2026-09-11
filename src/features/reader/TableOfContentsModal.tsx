import { useEffect, useRef, useState } from 'react'
import {
  filterTableOfContents,
  type TableOfContentsEntry,
} from '../../application/reading/readingUseCases'

interface TableOfContentsModalProps {
  readonly isOpen: boolean
  readonly entries: readonly TableOfContentsEntry[]
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
  readonly onSelectChapter: (chapterId: string) => void
}

export function TableOfContentsModal({
  isOpen,
  entries,
  triggerRef,
  onClose,
  onSelectChapter,
}: TableOfContentsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const currentChapterRef = useRef<HTMLButtonElement>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus()
      const currentChapter = currentChapterRef.current
      if (typeof currentChapter?.scrollIntoView === 'function') {
        currentChapter.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const closeAndRestoreFocus = () => {
    setSearchQuery('')
    onClose()
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeAndRestoreFocus()
    }
  }

  const handleSelect = (entry: TableOfContentsEntry) => {
    if (!entry.isAccessible) {
      return
    }

    onSelectChapter(entry.chapterId)
    closeAndRestoreFocus()
  }

  const filteredEntries = filterTableOfContents(entries, searchQuery)

  return (
    <div
      className="modal-backdrop"
      onClick={closeAndRestoreFocus}
      data-testid="toc-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal-content toc-modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="章節目錄"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2>章節目錄</h2>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉章節目錄"
            onClick={closeAndRestoreFocus}
          >
            關閉
          </button>
        </header>

        <div className="toc-search">
          <label className="toc-search-label" htmlFor="toc-search-input">
            搜尋章節
          </label>
          <div className="toc-search-controls">
            <input
              id="toc-search-input"
              className="toc-search-input"
              type="search"
              value={searchQuery}
              placeholder="輸入章名關鍵字"
              onChange={(event) => setSearchQuery(event.currentTarget.value)}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                className="button-secondary toc-search-clear-button"
                aria-label="清除搜尋"
                onClick={() => setSearchQuery('')}
              >
                清除
              </button>
            )}
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="toc-empty-state" role="status">
            尚無章節資料
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="toc-empty-state" role="status">
            沒有符合的章節
          </div>
        ) : (
          <ol className="toc-list" aria-label="章節列表">
            {filteredEntries.map((entry) => (
              <li key={entry.chapterId} className="toc-item">
                <button
                  ref={entry.isCurrent ? currentChapterRef : undefined}
                  type="button"
                  className={`toc-chapter-button ${entry.isCurrent ? 'is-current' : ''}`}
                  disabled={!entry.isAccessible}
                  aria-current={entry.isCurrent ? 'true' : undefined}
                  onClick={() => handleSelect(entry)}
                >
                  <span className="toc-chapter-title">{entry.title}</span>
                  {!entry.isAccessible && (
                    <span className="toc-locked-label">🔒 未開放</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
