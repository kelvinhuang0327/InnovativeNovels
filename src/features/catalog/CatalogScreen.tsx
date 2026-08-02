import { useId, useState } from 'react'
import {
  filterCatalog,
  listGenres,
} from '../../application/catalog/catalogUseCases'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { ContinueReadingShelf } from '../library/ContinueReadingShelf'

interface CatalogScreenProps {
  readonly books: readonly ContentBook[]
  readonly continueReading: readonly ContinueReadingEntry[]
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
}

export function CatalogScreen({
  books,
  continueReading,
  onOpenBook,
  onContinueBook,
}: CatalogScreenProps) {
  const [searchText, setSearchText] = useState('')
  const [selectedGenre, setSelectedGenre] = useState<string | undefined>(
    undefined,
  )
  const searchInputId = useId()

  const genres = listGenres(books)
  const visibleBooks = filterCatalog(books, {
    searchText,
    genre: selectedGenre,
  })
  const isFiltering =
    searchText.trim().length > 0 || selectedGenre !== undefined
  const resultSummary = isFiltering
    ? `找到 ${visibleBooks.length} 本`
    : `共 ${visibleBooks.length} 本`

  const clearFilters = () => {
    setSearchText('')
    setSelectedGenre(undefined)
  }

  return (
    <section aria-labelledby="catalog-heading">
      <h1 className="screen-heading" id="catalog-heading">
        探索故事
      </h1>
      <p className="screen-copy">從一段潮聲開始，走進今天的閱讀旅程。</p>

      {continueReading.length > 0 && (
        <ContinueReadingShelf
          entries={continueReading}
          onContinueBook={onContinueBook}
        />
      )}

      <div className="catalog-controls">
        <label className="catalog-search-label" htmlFor={searchInputId}>
          搜尋小說
        </label>
        <input
          className="catalog-search-input"
          id={searchInputId}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="搜尋書名或作者"
          type="search"
          value={searchText}
        />

        <div aria-label="依分類篩選" className="genre-filter" role="group">
          <button
            aria-pressed={selectedGenre === undefined}
            onClick={() => setSelectedGenre(undefined)}
            type="button"
          >
            全部
          </button>
          {genres.map((genre) => (
            <button
              aria-pressed={selectedGenre === genre}
              key={genre}
              onClick={() => setSelectedGenre(genre)}
              type="button"
            >
              {genre}
            </button>
          ))}
        </div>

        <button
          className="button-secondary"
          onClick={clearFilters}
          type="button"
        >
          清除篩選
        </button>
      </div>

      <p className="catalog-result-count">{resultSummary}</p>

      {visibleBooks.length === 0 ? (
        <p className="empty-state" role="status">
          找不到符合條件的小說
        </p>
      ) : (
        visibleBooks.map(({ book, description }) => (
          <article className="book-card" key={book.id}>
            <p className="book-meta">{book.categoryLabel}</p>
            <h2>{book.title}</h2>
            <p className="book-description">{description}</p>
            <button type="button" onClick={() => onOpenBook(book.id)}>
              查看書籍
            </button>
          </article>
        ))
      )}
    </section>
  )
}
