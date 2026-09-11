import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TableOfContentsEntry } from '../../application/reading/readingUseCases'
import { chapterId } from '../../domain/catalog/identifiers'
import { TableOfContentsModal } from './TableOfContentsModal'

const entries: readonly TableOfContentsEntry[] = [
  {
    chapterId: chapterId('intro'),
    title: '序章：星光',
    sequence: 1,
    isAccessible: true,
    isCurrent: true,
  },
  {
    chapterId: chapterId('second'),
    title: 'The Second Door',
    sequence: 2,
    isAccessible: true,
    isCurrent: false,
  },
  {
    chapterId: chapterId('locked'),
    title: 'second chance',
    sequence: 3,
    isAccessible: false,
    isCurrent: false,
  },
  {
    chapterId: chapterId('final'),
    title: '終章：餘韻',
    sequence: 4,
    isAccessible: true,
    isCurrent: false,
  },
]

interface TableOfContentsHarnessProps {
  readonly entries?: readonly TableOfContentsEntry[]
  readonly initiallyOpen?: boolean
  readonly onSelectChapter: (chapterId: string) => void
  readonly onClose?: () => void
}

function TableOfContentsHarness({
  entries: entriesToRender = entries,
  initiallyOpen = true,
  onSelectChapter,
  onClose = () => {},
}: TableOfContentsHarnessProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const handleClose = () => {
    setIsOpen(false)
    onClose()
  }

  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setIsOpen(true)}>
        開啟章節目錄
      </button>
      <TableOfContentsModal
        isOpen={isOpen}
        entries={entriesToRender}
        triggerRef={triggerRef}
        onClose={handleClose}
        onSelectChapter={onSelectChapter}
      />
    </>
  )
}

function renderHarness(
  props: Partial<TableOfContentsHarnessProps> = {},
) {
  const onSelectChapter = props.onSelectChapter ?? vi.fn()
  const view = render(
    <TableOfContentsHarness {...props} onSelectChapter={onSelectChapter} />,
  )
  return { ...view, onSelectChapter }
}

function getChapterTitles(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('button').textContent)
}

const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)

function mockScrollIntoView() {
  const scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
  return scrollIntoView
}

describe('TableOfContentsModal search', () => {
  beforeEach(() => {
    mockScrollIntoView()
  })

  afterEach(() => {
    cleanup()
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(
        HTMLElement.prototype,
        'scrollIntoView',
        originalScrollIntoViewDescriptor,
      )
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    }
  })

  it('positions the current chapter when opening without selecting or focusing it', () => {
    const scrollIntoView = mockScrollIntoView()
    const onSelectChapter = vi.fn()
    renderHarness({ initiallyOpen: false, onSelectChapter })

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(onSelectChapter).not.toHaveBeenCalled()
    expect(dialog).toHaveFocus()
    expect(
      within(dialog).getByRole('button', { name: '序章：星光' }),
    ).not.toHaveFocus()
  })

  it('safely skips positioning when no entry is current', () => {
    const scrollIntoView = mockScrollIntoView()
    const entriesWithoutCurrent = entries.map((entry) => ({
      ...entry,
      isCurrent: false,
    }))
    renderHarness({ entries: entriesWithoutCurrent, initiallyOpen: false })

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('safely skips positioning when scrollIntoView is unavailable', () => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    const onSelectChapter = vi.fn()
    const onClose = vi.fn()
    renderHarness({
      initiallyOpen: false,
      onSelectChapter,
      onClose,
    })

    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })
    expect(() => fireEvent.click(trigger)).not.toThrow()

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    expect(dialog).toHaveFocus()
    expect(
      within(dialog).getByRole('button', { name: '序章：星光' }),
    ).toHaveAttribute('aria-current', 'true')
    expect(onSelectChapter).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveFocus()
  })

  it('does not reposition during rerenders but positions again after closing and reopening', () => {
    const scrollIntoView = mockScrollIntoView()
    const { rerender } = renderHarness({ initiallyOpen: false })
    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })

    fireEvent.click(trigger)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    rerender(
      <TableOfContentsHarness initiallyOpen={false} onSelectChapter={vi.fn()} />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: '關閉章節目錄' }),
    )
    fireEvent.click(trigger)

    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('filters titles by trimmed, case-insensitive English and Chinese text in original order', () => {
    renderHarness()

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const searchInput = within(dialog).getByRole('searchbox', {
      name: '搜尋章節',
    })

    expect(getChapterTitles(dialog)).toEqual([
      '序章：星光',
      'The Second Door',
      'second chance🔒 未開放',
      '終章：餘韻',
    ])

    fireEvent.change(searchInput, { target: { value: '  SECOND  ' } })
    expect(getChapterTitles(dialog)).toEqual([
      'The Second Door',
      'second chance🔒 未開放',
    ])

    fireEvent.change(searchInput, { target: { value: '  星光  ' } })
    expect(getChapterTitles(dialog)).toEqual(['序章：星光'])

    fireEvent.change(searchInput, { target: { value: '   ' } })
    expect(getChapterTitles(dialog)).toEqual([
      '序章：星光',
      'The Second Door',
      'second chance🔒 未開放',
      '終章：餘韻',
    ])
  })

  it('keeps the original empty state separate from a no-results state', () => {
    const { rerender } = renderHarness()
    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const searchInput = within(dialog).getByRole('searchbox', {
      name: '搜尋章節',
    })

    fireEvent.change(searchInput, { target: { value: '不存在' } })
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      '沒有符合的章節',
    )
    expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()

    rerender(
      <TableOfContentsHarness entries={[]} onSelectChapter={vi.fn()} />,
    )
    expect(screen.getByText('尚無章節資料')).toBeInTheDocument()
    expect(screen.queryByText('沒有符合的章節')).not.toBeInTheDocument()
  })

  it('clears search without selecting a chapter and resets it after close and reopen', () => {
    const { onSelectChapter } = renderHarness()
    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const searchInput = within(dialog).getByRole('searchbox', {
      name: '搜尋章節',
    })

    fireEvent.change(searchInput, { target: { value: 'second' } })
    fireEvent.click(
      within(dialog).getByRole('button', { name: '清除搜尋' }),
    )

    expect(searchInput).toHaveValue('')
    expect(getChapterTitles(dialog)).toHaveLength(4)
    expect(onSelectChapter).not.toHaveBeenCalled()

    fireEvent.change(searchInput, { target: { value: '餘韻' } })
    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })
    fireEvent.click(within(dialog).getByRole('button', { name: '關閉章節目錄' }))
    expect(screen.queryByRole('dialog', { name: '章節目錄' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    const reopenedDialog = screen.getByRole('dialog', { name: '章節目錄' })
    expect(
      within(reopenedDialog).getByRole('searchbox', { name: '搜尋章節' }),
    ).toHaveValue('')
    expect(getChapterTitles(reopenedDialog)).toHaveLength(4)
  })

  it('keeps current and locked semantics and selects an accessible result once', () => {
    const onSelectChapter = vi.fn()
    renderHarness({ onSelectChapter })

    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const currentChapter = within(dialog).getByRole('button', {
      name: '序章：星光',
    })
    const lockedChapter = within(dialog).getByRole('button', {
      name: /second chance/,
    })

    expect(currentChapter).toHaveAttribute('aria-current', 'true')
    expect(lockedChapter).toBeDisabled()

    fireEvent.change(
      within(dialog).getByRole('searchbox', { name: '搜尋章節' }),
      { target: { value: 'second' } },
    )
    expect(onSelectChapter).not.toHaveBeenCalled()

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'The Second Door' }),
    )
    expect(onSelectChapter).toHaveBeenCalledTimes(1)
    expect(onSelectChapter).toHaveBeenCalledWith('second')
    expect(screen.queryByRole('dialog', { name: '章節目錄' })).not.toBeInTheDocument()
  })

  it('preserves dialog focus and trigger restoration for Escape, close, and backdrop dismissal', () => {
    const onClose = vi.fn()
    renderHarness({ onClose })

    const trigger = screen.getByRole('button', { name: '開啟章節目錄' })
    let dialog = screen.getByRole('dialog', { name: '章節目錄' })
    expect(dialog).toHaveFocus()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    dialog = screen.getByRole('dialog', { name: '章節目錄' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: '關閉章節目錄' }),
    )
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)
    fireEvent.click(screen.getByTestId('toc-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(3)
    expect(trigger).toHaveFocus()
  })
})
