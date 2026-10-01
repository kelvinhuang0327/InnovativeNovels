import { useEffect, useRef, useState, type RefObject } from 'react'
import type { BookTextSearchResult } from '../../application/reading/readingUseCases'

interface BookTextSearchModalProps {
  readonly isOpen: boolean
  readonly triggerRef: RefObject<HTMLButtonElement | null>
  readonly searchBookText: (query: string) => readonly BookTextSearchResult[]
  readonly onClose: () => void
  readonly onSelectResult: (result: BookTextSearchResult) => void
}

function renderSnippet(result: BookTextSearchResult, query: string) {
  const snippetStart = Math.max(0, result.matchIndex - 48)
  const matchEnd = result.matchIndex + query.length
  const snippetEnd = Math.min(result.paragraphText.length, matchEnd + 72)

  return (
    <>
      {snippetStart > 0 ? '…' : ''}
      {result.paragraphText.slice(snippetStart, result.matchIndex)}
      <mark>
        {result.paragraphText.slice(result.matchIndex, matchEnd)}
      </mark>
      {result.paragraphText.slice(matchEnd, snippetEnd)}
      {snippetEnd < result.paragraphText.length ? '…' : ''}
    </>
  )
}

export function BookTextSearchModal({
  isOpen,
  triggerRef,
  searchBookText,
  onClose,
  onSelectResult,
}: BookTextSearchModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const closeAndRestoreFocus = () => {
    setQuery('')
    onClose()
    triggerRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      closeAndRestoreFocus()
    }
  }

  const normalizedQuery = query.trim()
  const results = searchBookText(normalizedQuery)

  return (
    <div
      className="modal-backdrop"
      onClick={closeAndRestoreFocus}
      data-testid="book-text-search-backdrop"
    >
      <div
        ref={dialogRef}
        className="modal-content book-text-search-modal"
        role="dialog"
        aria-modal="true"
        aria-label="搜尋本書內文"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <h2>搜尋本書內文</h2>
          <button
            type="button"
            className="button-secondary close-button"
            aria-label="關閉內文搜尋"
            onClick={closeAndRestoreFocus}
          >
            關閉
          </button>
        </header>

        <div className="toc-search">
          <label className="toc-search-label" htmlFor="book-text-search-input">
            搜尋關鍵字
          </label>
          <div className="toc-search-controls">
            <input
              ref={inputRef}
              id="book-text-search-input"
              className="toc-search-input"
              type="search"
              value={query}
              placeholder="輸入作品內文關鍵字"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            {query.length > 0 && (
              <button
                type="button"
                className="button-secondary toc-search-clear-button"
                aria-label="清除內文搜尋"
                onClick={() => setQuery('')}
              >
                清除
              </button>
            )}
          </div>
        </div>

        {normalizedQuery.length === 0 ? (
          <div className="toc-empty-state" role="status">
            輸入關鍵字即可搜尋本書可閱讀章節的內文
          </div>
        ) : results.length === 0 ? (
          <div className="toc-empty-state" role="status">
            找不到符合「{normalizedQuery}」的內文
          </div>
        ) : (
          <>
            <div className="book-text-search-count" role="status" aria-live="polite">
              找到 {results.length} 個結果
            </div>
            <ol className="toc-list book-text-search-results" aria-label="內文搜尋結果">
              {results.map((result) => (
                <li
                  key={`${result.chapterId}:${result.paragraphIndex}:${result.matchIndex}`}
                >
                  <button
                    type="button"
                    className="book-text-search-result"
                    onClick={() => {
                      onSelectResult(result)
                      closeAndRestoreFocus()
                    }}
                  >
                    <span className="book-text-search-chapter">
                      第 {result.chapterSequence} 章・{result.chapterTitle}
                    </span>
                    <span className="book-text-search-snippet">
                      {renderSnippet(result, normalizedQuery)}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  )
}
