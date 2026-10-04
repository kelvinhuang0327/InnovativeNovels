import { useEffect, useRef, useState } from 'react'

interface ChapterReadingNoteModalProps {
  readonly isOpen: boolean
  readonly chapterTitle: string
  readonly noteTargetKey?: string
  readonly initialContent: string
  readonly isPersistentStorageAvailable?: boolean
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>
  readonly onClose: () => void
  readonly onSave: (content: string) => void
}

export function ChapterReadingNoteModal({
  isOpen,
  ...dialogProps
}: ChapterReadingNoteModalProps) {
  if (!isOpen) {
    return null
  }

  const dialogKey = `${dialogProps.noteTargetKey ?? dialogProps.chapterTitle}\u0000${dialogProps.initialContent}`

  return <OpenChapterReadingNoteDialog key={dialogKey} {...dialogProps} />
}

function OpenChapterReadingNoteDialog({
  chapterTitle,
  initialContent,
  isPersistentStorageAvailable = true,
  triggerRef,
  onClose,
  onSave,
}: Omit<ChapterReadingNoteModalProps, 'isOpen'>) {
  const [draft, setDraft] = useState(initialContent)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

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
        {!isPersistentStorageAvailable && (
          <p className="chapter-reading-note-storage-warning" role="status">
            永久儲存目前不可用；本章筆記只暫存在目前分頁，重新整理或關閉分頁後會遺失。
          </p>
        )}

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
