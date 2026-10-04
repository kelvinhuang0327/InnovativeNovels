import { useRef, useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookTextSearchResult } from '../../application/reading/readingUseCases'
import { chapterSequence } from '../../domain/catalog/chapter'
import { chapterId } from '../../domain/catalog/identifiers'
import { BookTextSearchModal } from './BookTextSearchModal'

function createResult(): BookTextSearchResult {
  const paragraphText = '在海邊看見鹽晶映著月光，遠處仍有鹽晶。'

  return {
    chapterId: chapterId('chapter-2'),
    chapterTitle: '第二章：海邊',
    chapterSequence: chapterSequence(2),
    paragraphIndex: 3,
    paragraphText,
    matchIndex: paragraphText.indexOf('鹽晶'),
  }
}

function SearchModalHarness({
  searchBookText,
  onSelectResult = vi.fn(),
  onClose = vi.fn(),
}: {
  readonly searchBookText: (
    query: string,
  ) => readonly BookTextSearchResult[]
  readonly onSelectResult?: (result: BookTextSearchResult) => void
  readonly onClose?: () => void
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)}>
        Open text search
      </button>
      <BookTextSearchModal
        isOpen={isOpen}
        triggerRef={triggerRef}
        searchBookText={searchBookText}
        onClose={() => {
          setIsOpen(false)
          onClose()
        }}
        onSelectResult={onSelectResult}
      />
    </>
  )
}

describe('BookTextSearchModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('starts blank with instructions and focuses the search field', () => {
    const searchBookText = vi.fn(() => [])
    render(<SearchModalHarness searchBookText={searchBookText} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open text search' }))

    expect(
      screen.getByRole('dialog', { name: '搜尋本書內文' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '搜尋關鍵字' })).toHaveValue(
      '',
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      '輸入關鍵字即可搜尋本書可閱讀章節的內文',
    )
    expect(screen.getByRole('searchbox', { name: '搜尋關鍵字' })).toHaveFocus()
    expect(searchBookText).toHaveBeenCalledWith('')
  })

  it('shows an explicit no-result state', () => {
    const searchBookText = vi.fn(() => [])
    render(<SearchModalHarness searchBookText={searchBookText} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open text search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋關鍵字' }), {
      target: { value: 'missing phrase' },
    })

    expect(screen.getByRole('status')).toHaveTextContent(
      '找不到符合「missing phrase」的內文',
    )
    expect(screen.queryByRole('list', { name: '內文搜尋結果' })).toBeNull()
  })

  it('shows chapter title and a highlighted snippet in a keyboard-reachable result action', () => {
    const result = createResult()
    const onSelectResult = vi.fn()
    const searchBookText = vi.fn((query: string) =>
      query === '鹽晶' ? [result] : [],
    )
    render(
      <SearchModalHarness
        searchBookText={searchBookText}
        onSelectResult={onSelectResult}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open text search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋關鍵字' }), {
      target: { value: '鹽晶' },
    })

    const results = screen.getByRole('list', { name: '內文搜尋結果' })
    const resultAction = within(results).getByRole('button', {
      name: /第二章：海邊/,
    })
    expect(within(resultAction).getByText('第 2 章・第二章：海邊')).toBeInTheDocument()
    expect(resultAction.querySelector('mark')?.textContent).toBe('鹽晶')
    expect(resultAction.tagName).toBe('BUTTON')
    expect(resultAction.tabIndex).toBe(0)

    resultAction.focus()
    expect(resultAction).toHaveFocus()

    fireEvent.click(resultAction)

    expect(onSelectResult).toHaveBeenCalledWith(result)
    expect(
      screen.queryByRole('dialog', { name: '搜尋本書內文' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open text search' })).toHaveFocus()
  })

  it('highlights all case-insensitive matches while preserving snippet casing', () => {
    const paragraphText = 'The SALT wind carried salt across the shore.'
    const result = {
      ...createResult(),
      paragraphText,
      matchIndex: paragraphText.toLowerCase().indexOf('salt'),
    }
    const searchBookText = vi.fn((query: string) =>
      query === 'salt' ? [result] : [],
    )
    render(<SearchModalHarness searchBookText={searchBookText} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open text search' }))
    fireEvent.change(screen.getByRole('searchbox', { name: '搜尋關鍵字' }), {
      target: { value: 'salt' },
    })

    const snippet = screen
      .getByRole('list', { name: '內文搜尋結果' })
      .querySelector('.book-text-search-snippet')

    expect(snippet?.textContent).toBe(paragraphText)
    expect(
      Array.from(snippet?.querySelectorAll('mark') ?? []).map(
        (match) => match.textContent,
      ),
    ).toEqual(['SALT', 'salt'])
  })

  it('closes on Escape and returns focus to the search trigger', () => {
    const onClose = vi.fn()
    render(<SearchModalHarness searchBookText={() => []} onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Open text search' })
    fireEvent.click(trigger)

    fireEvent.keyDown(screen.getByRole('dialog', { name: '搜尋本書內文' }), {
      key: 'Escape',
    })

    expect(
      screen.queryByRole('dialog', { name: '搜尋本書內文' }),
    ).not.toBeInTheDocument()
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveFocus()
  })
})
