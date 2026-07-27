import { useEffect, useRef } from 'react'
import type { TableOfContentsEntry } from '../../application/reading/readingUseCases'

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

  const handleSelect = (entry: TableOfContentsEntry) => {
    if (!entry.isAccessible) {
      return
    }

    onSelectChapter(entry.chapterId)
    closeAndRestoreFocus()
  }

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

        {entries.length === 0 ? (
          <div className="toc-empty-state" role="status">
            尚無章節資料
          </div>
        ) : (
          <ol className="toc-list" aria-label="章節列表">
            {entries.map((entry) => (
              <li key={entry.chapterId} className="toc-item">
                <button
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
