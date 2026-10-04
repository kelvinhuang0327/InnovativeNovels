import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChapterReadingNoteModal } from './ChapterReadingNoteModal'

interface HarnessProps {
  readonly initialContent?: string
  readonly isPersistentStorageAvailable?: boolean
  readonly onSave: (content: string) => void
}

function Harness({
  initialContent = '',
  isPersistentStorageAvailable = true,
  onSave,
}: HarnessProps) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
      >
        開啟本章筆記
      </button>
      <ChapterReadingNoteModal
        isOpen={isOpen}
        chapterTitle="第一章：潮聲來信"
        initialContent={initialContent}
        isPersistentStorageAvailable={isPersistentStorageAvailable}
        triggerRef={triggerRef}
        onClose={() => setIsOpen(false)}
        onSave={onSave}
      />
    </>
  )
}

function renderHarness(
  initialContent = '',
  isPersistentStorageAvailable = true,
) {
  const onSave = vi.fn()
  const view = render(
    <Harness
      initialContent={initialContent}
      isPersistentStorageAvailable={isPersistentStorageAvailable}
      onSave={onSave}
    />,
  )

  return { ...view, onSave }
}

afterEach(() => {
  cleanup()
})

describe('ChapterReadingNoteModal', () => {
  it('loads the saved note into a plain-text editor', () => {
    renderHarness('first line\nsecond line')

    fireEvent.click(screen.getByRole('button', { name: '開啟本章筆記' }))

    const dialog = screen.getByRole('dialog', { name: '本章筆記' })
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByLabelText('筆記內容')).toHaveValue(
      'first line\nsecond line',
    )
    expect(within(dialog).getByText('第一章：潮聲來信')).toBeInTheDocument()
  })

  it('saves edited text with its line breaks and restores focus', () => {
    const { onSave } = renderHarness('old note')
    const trigger = screen.getByRole('button', { name: '開啟本章筆記' })

    fireEvent.click(trigger)
    fireEvent.change(screen.getByLabelText('筆記內容'), {
      target: { value: 'updated\nplain text' },
    })
    fireEvent.click(screen.getByRole('button', { name: '儲存筆記' }))

    expect(onSave).toHaveBeenCalledExactlyOnceWith('updated\nplain text')
    expect(screen.queryByRole('dialog', { name: '本章筆記' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('clears the current note', () => {
    const { onSave } = renderHarness('saved note')

    fireEvent.click(screen.getByRole('button', { name: '開啟本章筆記' }))
    fireEvent.click(screen.getByRole('button', { name: '清除筆記' }))

    expect(onSave).toHaveBeenCalledExactlyOnceWith('')
    expect(screen.queryByRole('dialog', { name: '本章筆記' })).not.toBeInTheDocument()
  })

  it('states that notes are session-only when persistent browser storage is unavailable', () => {
    renderHarness('', false)

    fireEvent.click(screen.getByRole('button', { name: '開啟本章筆記' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      '本章筆記只暫存在目前分頁，重新整理或關閉分頁後會遺失。',
    )
  })

  it('closes on Escape and returns focus to its trigger without saving', () => {
    const { onSave } = renderHarness('saved note')
    const trigger = screen.getByRole('button', { name: '開啟本章筆記' })

    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog', { name: '本章筆記' }), {
      key: 'Escape',
    })

    expect(screen.queryByRole('dialog', { name: '本章筆記' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(onSave).not.toHaveBeenCalled()
  })
})
