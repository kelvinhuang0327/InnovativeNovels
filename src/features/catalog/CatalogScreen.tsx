import { useId, useState } from 'react'
import {
  filterCatalog,
  formatCatalogDepthLabel,
  getReadingDepth,
  listGenres,
} from '../../application/catalog/catalogUseCases'
import type { CatalogAvailability } from '../../application/catalog/catalogUseCases'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { ContinueReadingShelf } from '../library/ContinueReadingShelf'

interface CatalogScreenProps {
  readonly books: readonly ContentBook[]
  readonly continueReading: readonly ContinueReadingEntry[]
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
  readonly onOpenAuthoring?: () => void
}

interface BookstoreHeroProps {
  readonly featuredBook: ContentBook | undefined
  readonly onOpenBook: (bookId: string) => void
}

interface GenreDiscoveryProps {
  readonly genres: readonly string[]
  readonly selectedGenre: string | undefined
  readonly onSelectGenre: (genre: string | undefined) => void
}

interface EditorialShelfProps {
  readonly books: readonly ContentBook[]
  readonly onOpenBook: (bookId: string) => void
}

type CatalogSortMode =
  | 'bookstore'
  | 'title-asc'
  | 'title-desc'
  | 'author-asc'
  | 'author-desc'
  | 'chapters-desc'
  | 'chapters-asc'
  | 'readable-desc'
  | 'readable-asc'

const CATALOG_SORT_OPTIONS: readonly {
  readonly value: CatalogSortMode
  readonly label: string
}[] = [
  { value: 'bookstore', label: '書庫順序' },
  { value: 'title-asc', label: '書名升冪' },
  { value: 'title-desc', label: '書名降冪' },
  { value: 'author-asc', label: '作者升冪' },
  { value: 'author-desc', label: '作者降冪' },
  { value: 'chapters-desc', label: '章節較多優先' },
  { value: 'chapters-asc', label: '章節較少優先' },
  { value: 'readable-desc', label: '可讀章節較多優先' },
  { value: 'readable-asc', label: '可讀章節較少優先' },
]

const CATALOG_TEXT_COLLATOR = new Intl.Collator('zh-Hant')

function sortCatalogResults(
  entries: readonly ContentBook[],
  sortMode: CatalogSortMode,
): readonly ContentBook[] {
  if (sortMode === 'bookstore') {
    return entries
  }

  const isReadabilitySort = sortMode.startsWith('readable-')

  return entries
    .map((entry, index) => ({
      entry,
      index,
      openableChapterCount: isReadabilitySort
        ? getReadingDepth(entry.chapters).openableChapters
        : 0,
    }))
    .sort((left, right) => {
      const difference =
        sortMode.startsWith('title-')
          ? CATALOG_TEXT_COLLATOR.compare(
              left.entry.book.title,
              right.entry.book.title,
            )
          : sortMode.startsWith('author-')
            ? CATALOG_TEXT_COLLATOR.compare(
              left.entry.book.authorName,
              right.entry.book.authorName,
            )
            : isReadabilitySort
              ? left.openableChapterCount - right.openableChapterCount
              : left.entry.chapters.length - right.entry.chapters.length

      if (difference === 0) {
        return left.index - right.index
      }

      return sortMode.endsWith('-desc')
        ? -difference
        : difference
    })
    .map(({ entry }) => entry)
}

function BookstoreHero({ featuredBook, onOpenBook }: BookstoreHeroProps) {
  return (
    <header className="bookstore-hero">
      <div className="bookstore-hero-copy">
        <p className="bookstore-kicker">InnovativeNovels · 故事書庫</p>
        <h1 className="bookstore-hero-title" id="catalog-heading">
          探索故事
        </h1>
        <p className="bookstore-hero-supporting-copy">
          從一段潮聲開始，走進今天的閱讀旅程。
        </p>
        {featuredBook && (
          <button
            className="bookstore-hero-action"
            onClick={() => onOpenBook(featuredBook.book.id)}
            type="button"
          >
            閱讀焦點作品
          </button>
        )}
      </div>

      {featuredBook && (
        <div className="bookstore-spotlight">
          <p className="bookstore-spotlight-label">本日焦點</p>
          <div
            aria-hidden="true"
            className="bookstore-spotlight-cover"
            data-title={featuredBook.book.title}
          >
            <span>IN</span>
          </div>
          <div className="bookstore-spotlight-details">
            <p className="book-meta">{featuredBook.book.categoryLabel}</p>
            <h2
              aria-label={featuredBook.book.title}
              className="bookstore-spotlight-title"
              data-title={featuredBook.book.title}
            />
            <p>{featuredBook.book.authorName}</p>
          </div>
        </div>
      )}
    </header>
  )
}

function GenreDiscovery({
  genres,
  selectedGenre,
  onSelectGenre,
}: GenreDiscoveryProps) {
  return (
    <section
      aria-labelledby="genre-discovery-heading"
      className="genre-discovery"
    >
      <div className="section-heading-row">
        <div>
          <p className="section-kicker">找一種閱讀心情</p>
          <h2 className="section-heading" id="genre-discovery-heading">
            依類型找故事
          </h2>
        </div>
        <p className="section-heading-note">{genres.length} 種分類</p>
      </div>

      <div aria-label="依分類瀏覽" className="genre-filter" role="group">
        <button
          aria-pressed={selectedGenre === undefined}
          className="genre-tile genre-tile-all"
          onClick={() => onSelectGenre(undefined)}
          type="button"
        >
          <span className="genre-tile-mark" aria-hidden="true">
            全
          </span>
          <span>全部</span>
        </button>
        {genres.map((genre, index) => (
          <button
            aria-pressed={selectedGenre === genre}
            className="genre-tile"
            key={genre}
            onClick={() => onSelectGenre(genre)}
            type="button"
          >
            <span aria-hidden="true" className="genre-tile-mark">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{genre}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function formatCatalogCardDepthLabel(
  depth: ReturnType<typeof getReadingDepth>,
): string {
  return depth.totalChapters === 0
    ? '尚無章節'
    : formatCatalogDepthLabel(depth)
}

function EditorialShelf({ books, onOpenBook }: EditorialShelfProps) {
  const editorialBooks = books.slice(0, 3)

  if (editorialBooks.length === 0) {
    return null
  }

  return (
    <section
      aria-labelledby="editorial-discovery-heading"
      className="editorial-discovery"
    >
      <div className="section-heading-row">
        <div>
          <p className="section-kicker">沿著書庫順序翻頁</p>
          <h2 className="section-heading" id="editorial-discovery-heading">
            編輯精選
          </h2>
        </div>
        <p className="section-heading-note">先讀這幾本</p>
      </div>

      <ul className="editorial-list">
        {editorialBooks.map(({ book, chapters, description }) => {
          const depth = getReadingDepth(chapters)
          const depthLabel = formatCatalogCardDepthLabel(depth)

          return (
            <li className="editorial-card" key={book.id}>
              <div
                aria-hidden="true"
                className="editorial-card-cover"
                data-title={book.title}
              >
                <span>{book.categoryLabel}</span>
              </div>
              <div className="editorial-card-copy">
                <p className="book-meta">
                  {book.authorName} · {depthLabel}
                </p>
                <h3
                  aria-label={book.title}
                  className="editorial-card-title"
                  data-title={book.title}
                />
                <p>{description}</p>
                <button
                  className="button-secondary editorial-card-action"
                  onClick={() => onOpenBook(book.id)}
                  type="button"
                >
                  開啟作品
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function BookCard({
  book,
  chapters,
  description,
  onOpenBook,
}: ContentBook & { readonly onOpenBook: (bookId: string) => void }) {
  const depth = getReadingDepth(chapters)
  const depthLabel = formatCatalogCardDepthLabel(depth)

  return (
    <article className="book-card">
      <div
        aria-hidden="true"
        className="book-card-cover"
        data-title={book.title}
      >
        <span>IN</span>
      </div>
      <div className="book-card-body">
        <div className="book-card-topline">
          <p className="book-meta">{book.categoryLabel}</p>
          <span className="book-chapter-count">{depthLabel}</span>
        </div>
        <h3>{book.title}</h3>
        <p className="book-card-author">{book.authorName}</p>
        <p className="book-description">{description}</p>
        <button
          className="book-card-action"
          onClick={() => onOpenBook(book.id)}
          type="button"
        >
          查看書籍
        </button>
      </div>
    </article>
  )
}


export function CatalogScreen({
  books,
  continueReading,
  onOpenBook,
  onContinueBook,
  onOpenAuthoring,
}: CatalogScreenProps) {
  const [searchText, setSearchText] = useState('')
  const [selectedGenre, setSelectedGenre] = useState<string | undefined>(
    undefined,
  )
  const [availabilityFilter, setAvailabilityFilter] = useState<
    CatalogAvailability | undefined
  >()
  const [sortMode, setSortMode] = useState<CatalogSortMode>('bookstore')
  const searchInputId = useId()
  const sortInputId = useId()
  const availabilityInputId = useId()

  const genres = listGenres(books)
  const filteredBooks = filterCatalog(books, {
    searchText,
    genre: selectedGenre,
    availability: availabilityFilter,
  })
  const visibleBooks = sortCatalogResults(filteredBooks, sortMode)
  const isFiltering =
    searchText.trim().length > 0 ||
    selectedGenre !== undefined ||
    availabilityFilter !== undefined
  const resultSummary = isFiltering
    ? `找到 ${visibleBooks.length} 本`
    : `共 ${visibleBooks.length} 本`

  const clearFilters = () => {
    setSearchText('')
    setSelectedGenre(undefined)
    setAvailabilityFilter(undefined)
  }

  return (
    <section
      aria-labelledby="catalog-heading"
      className={`bookstore-screen${isFiltering ? ' is-filtering' : ''}`}
    >
      {isFiltering ? (
        <header className="bookstore-filtered-header">
          <p className="bookstore-kicker">書庫搜尋</p>
          <h1 className="screen-heading" id="catalog-heading">
            探索故事
          </h1>
          <p className="bookstore-filtered-copy">
            依照你的搜尋條件，查看符合的作品。
          </p>
        </header>
      ) : (
        <BookstoreHero
          featuredBook={books[0]}
          onOpenBook={onOpenBook}
        />
      )}

      <div className="catalog-controls">
        <div className="catalog-search-block">
          <label className="catalog-search-label" htmlFor={searchInputId}>
            搜尋小說
          </label>
          <input
            className="catalog-search-input"
            id={searchInputId}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="搜尋書名、作者或描述"
            type="search"
            value={searchText}
          />
        </div>

        <div className="catalog-sort-block">
          <label className="catalog-sort-label" htmlFor={sortInputId}>
            排序方式
          </label>
          <select
            className="catalog-sort-select"
            id={sortInputId}
            onChange={(event) =>
              setSortMode(event.target.value as CatalogSortMode)
            }
            value={sortMode}
          >
            {CATALOG_SORT_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="catalog-sort-block">
          <label className="catalog-sort-label" htmlFor={availabilityInputId}>
            章節可讀性
          </label>
          <select
            className="catalog-sort-select"
            id={availabilityInputId}
            onChange={(event) =>
              setAvailabilityFilter(
                event.target.value === ''
                  ? undefined
                  : (event.target.value as CatalogAvailability),
              )
            }
            value={availabilityFilter ?? ''}
          >
            <option value="">全部作品</option>
            <option value="ALL_CHAPTERS_OPENABLE">所有章節皆可閱讀</option>
            <option value="AT_LEAST_ONE_CHAPTER_OPENABLE">
              至少一章可閱讀
            </option>
          </select>
        </div>

        {isFiltering && (
          <button
            className="button-secondary catalog-clear-button"
            onClick={clearFilters}
            type="button"
          >
            清除篩選
          </button>
        )}
      </div>

      {!isFiltering && continueReading.length > 0 && (
        <ContinueReadingShelf
          entries={continueReading}
          onContinueBook={onContinueBook}
        />
      )}

      <GenreDiscovery
        genres={genres}
        onSelectGenre={setSelectedGenre}
        selectedGenre={selectedGenre}
      />

      {!isFiltering && (
        <EditorialShelf books={books} onOpenBook={onOpenBook} />
      )}

      <section
        aria-labelledby="catalog-results-heading"
        className="catalog-results"
      >
        <div className="catalog-results-header">
          <div>
            <p className="section-kicker">{isFiltering ? '符合條件' : '全部作品'}</p>
            <h2 className="section-heading" id="catalog-results-heading">
              {isFiltering ? '篩選結果' : '探索更多故事'}
            </h2>
          </div>
          <p aria-live="polite" className="catalog-result-count">
            {resultSummary}
          </p>
        </div>

        {visibleBooks.length === 0 ? (
          <p className="empty-state" role="status">
            找不到符合條件的小說
          </p>
        ) : (
          <div className="book-grid">
            {visibleBooks.map((entry) => (
              <BookCard
                {...entry}
                key={entry.book.id}
                onOpenBook={onOpenBook}
              />
            ))}
          </div>
        )}
      </section>

      {onOpenAuthoring && (
        <aside aria-label="創作工具" className="authoring-entry">
          <div>
            <p className="section-kicker">創作工具</p>
            <p className="authoring-entry-copy">也想寫下下一個故事？</p>
          </div>
          <button
            className="button-secondary"
            onClick={onOpenAuthoring}
            type="button"
          >
            開啟創作預覽
          </button>
        </aside>
      )}
    </section>
  )
}
