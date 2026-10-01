import { useEffect, useRef, useState } from 'react'

interface ChapterReadingNoteModalProps {
  readonly isOpen: boolean
  readonly chapterTitle: string
  readonly initialContent: string
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
  readonly onSave: (content: string) => void
}

export function ChapterReadingNoteModal({
  isOpen,
  chapterTitle,
  initialContent,
  triggerRef,
  onClose,
  onSave,
}: ChapterReadingNoteModalProps) {
  const [draft, setDraft] = useState(initialContent)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setDraft(initialContent)
      dialogRef.current?.focus()
    }
  }, [initialContent, isOpen])

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

  const handleSave = () => {
    onSave(draft)
    closeAndRestoreFocus()
  }

  const handleClear = () => {
    onSave('')
    closeAndRestoreFocus()
  }

  return (
    <div
      className="modal-backdrop"
      onClick={closeAndRestoreFocus}
      data-testid="chapter-reading-note-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal-content chapter-reading-note-modal"
        role="dialog"
        aria-modal="true"
        aria-label="本章筆記"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2>本章筆記</h2>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉本章筆記"
            onClick={closeAndRestoreFocus}
          >
            關閉
          </button>
        </header>

        <p className="chapter-reading-note-chapter">{chapterTitle}</p>
        <label className="chapter-reading-note-label" htmlFor="chapter-reading-note-content">
          筆記內容
        </label>
        <textarea
          id="chapter-reading-note-content"
          className="chapter-reading-note-editor"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          rows={8}
          spellCheck
        />

        <div className="chapter-reading-note-actions">
          <button
            type="button"
            className="button-secondary chapter-reading-note-clear"
            onClick={handleClear}
          >
            清除筆記
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={closeAndRestoreFocus}
          >
            取消
          </button>
          <button type="button" className="button-primary" onClick={handleSave}>
            儲存筆記
          </button>
        </div>
      </div>
    </div>
  )
}
