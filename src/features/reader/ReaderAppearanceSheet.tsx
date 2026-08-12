import { useEffect, useRef } from 'react'
import type { ReaderPreferences } from '../../domain/reading/readerPreferences'
import { ReaderComfortControls } from './ReaderComfortControls'

interface ReaderAppearanceSheetProps {
  readonly isOpen: boolean
  readonly preferences: ReaderPreferences
  readonly triggerRef: React.RefObject<HTMLButtonElement | null>
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
  readonly onClose: () => void
}

export function ReaderAppearanceSheet({
  isOpen,
  preferences,
  triggerRef,
  onChangePreferences,
  onResetPreferences,
  onClose,
}: ReaderAppearanceSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.focus()
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
      className="reader-appearance-backdrop"
      data-testid="reader-appearance-backdrop"
      onClick={closeAndRestoreFocus}
    >
      <div
        ref={sheetRef}
        className="reader-appearance-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reader-appearance-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="reader-appearance-header">
          <div>
            <p className="reader-appearance-eyebrow">閱讀體驗</p>
            <h2 id="reader-appearance-title">閱讀設定</h2>
            <p className="reader-appearance-description">
              調整後會立即套用，並在下一章與下次開啟時保留。
            </p>
          </div>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉閱讀設定"
            onClick={closeAndRestoreFocus}
          >
            關閉
          </button>
        </header>

        <ReaderComfortControls
          preferences={preferences}
          onChangePreferences={onChangePreferences}
          onResetPreferences={onResetPreferences}
        />
      </div>
    </div>
  )
}
