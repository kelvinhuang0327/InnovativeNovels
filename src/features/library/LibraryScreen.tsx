import { useState } from 'react'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type {
  BookmarkEntry,
  ContinueReadingEntry,
} from '../../application/reading/readingUseCases'
import {
  filterBookshelfBooks,
  type RecentReadingEntry,
} from '../../application/library/libraryUseCases'
import { ContinueReadingShelf } from './ContinueReadingShelf'

interface LibraryScreenProps {
  readonly books: readonly ContentBook[]
  readonly bookmarks: readonly BookmarkEntry[]
  readonly recentReading: readonly RecentReadingEntry[]
  readonly continueReading: readonly ContinueReadingEntry[]
  readonly onBackToBookstore: () => void
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
  readonly onOpenBookmark: (position: BookmarkEntry['position']) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveFromBookshelf: (bookId: string) => void
}

function chapterProgressPercentage(chapterProgress: number): number {
  if (!Number.isFinite(chapterProgress)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(chapterProgress * 100)))
}

function LibraryBookCard({
  book,
  onOpenBook,
  onRemoveFromBookshelf,
}: {
  readonly book: ContentBook
  readonly onOpenBook: (bookId: string) => void
  readonly onRemoveFromBookshelf: (bookId: string) => void
}) {
  return (
    <li className="library-book-item">
      <div
        aria-hidden="true"
        className="library-book-cover"
        data-title={book.book.title}
      >
        <span>{book.book.categoryLabel}</span>
      </div>
      <div className="library-book-copy">
        <p className="book-meta">{book.book.categoryLabel}</p>
        <h3>{book.book.title}</h3>
        <p className="library-book-author">{book.book.authorName}</p>
        <p className="library-book-count">共 {book.chapters.length} 章</p>
        <div className="library-book-actions">
          <button
            type="button"
            onClick={() => onOpenBook(book.book.id)}
          >
            查看書籍
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => onRemoveFromBookshelf(book.book.id)}
          >
            移出書架
          </button>
        </div>
      </div>
    </li>
  )
}

function RecentReadingCard({
  entry,
  onOpenBook,
  onContinueBook,
}: {
  readonly entry: RecentReadingEntry
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
}) {
  const { book, chapterTitle, position } = entry
  const progressPercentage = position
    ? chapterProgressPercentage(position.chapterProgress)
    : undefined

  return (
    <li className="library-recent-item">
      <div
        aria-hidden="true"
        className="library-recent-cover"
        data-title={book.book.title}
      >
        <span>{book.book.categoryLabel}</span>
      </div>
      <div className="library-recent-copy">
        <p className="book-meta">{book.book.categoryLabel}</p>
        <h3>{book.book.title}</h3>
        <p className="library-book-author">{book.book.authorName}</p>
        <p className="library-recent-chapter">
          {chapterTitle ? `目前章節 · ${chapterTitle}` : '尚未儲存閱讀位置'}
        </p>
        {progressPercentage !== undefined && (
          <>
            <p className="library-recent-progress">
              本章進度 {progressPercentage}%
            </p>
            <progress
              aria-label={`本章進度 ${progressPercentage}%`}
              max={100}
              value={progressPercentage}
            >
              {progressPercentage}%
            </progress>
          </>
        )}
        <div className="library-book-actions">
          <button
            type="button"
            onClick={() => onContinueBook(book.book.id)}
          >
            {chapterTitle ? '繼續閱讀' : '開始閱讀'}
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => onOpenBook(book.book.id)}
          >
            查看書籍
          </button>
        </div>
      </div>
    </li>
  )
}

export function LibraryScreen({
  books,
  bookmarks,
  recentReading,
  continueReading,
  onBackToBookstore,
  onOpenBook,
  onContinueBook,
  onOpenBookmark,
  onRemoveBookmark,
  onRemoveFromBookshelf,
}: LibraryScreenProps) {
  const [bookshelfSearch, setBookshelfSearch] = useState('')
  const hasBookshelfSearch = bookshelfSearch.trim().length > 0
  const visibleBooks = filterBookshelfBooks(books, bookshelfSearch)

  return (
    <section
      aria-label="個人閱讀中心"
      className="library-screen"
    >
      <header className="library-header">
        <div>
          <p className="section-kicker">個人閱讀</p>
          <h1 className="screen-heading" id="library-heading">
            我的書架
          </h1>
          <p className="library-supporting-copy">
            把想讀的故事留在身邊，回來就能接著讀。
          </p>
        </div>
      </header>

      {continueReading.length > 0 && (
        <ContinueReadingShelf
          entries={continueReading}
          onContinueBook={onContinueBook}
        />
      )}

      <section
        aria-labelledby="bookmarks-heading"
        className="library-section"
      >
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">儲存的閱讀位置</p>
            <h2 className="section-heading" id="bookmarks-heading">
              章節書籤
            </h2>
          </div>
          <p className="section-heading-note">{bookmarks.length} 個</p>
        </div>

        {bookmarks.length === 0 ? (
          <div className="library-empty-state" role="status">
            <p>還沒有章節書籤。</p>
          </div>
        ) : (
          <ul className="library-recent-list">
            {bookmarks.map(({ book, chapter, position }) => (
              <li
                className="library-recent-item"
                key={`${book.book.id}:${chapter.id}`}
              >
                <div className="library-recent-copy">
                  <p className="book-meta">{book.book.categoryLabel}</p>
                  <h3>{book.book.title}</h3>
                  <p className="library-recent-chapter">{chapter.title}</p>
                  <div className="library-book-actions">
                    <button
                      type="button"
                      onClick={() => onOpenBookmark(position)}
                    >
                      移至章節
                    </button>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() =>
                        onRemoveBookmark(book.book.id, chapter.id)
                      }
                    >
                      移除
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="bookshelf-heading"
        className="library-section"
      >
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">收藏的故事</p>
            <h2 className="section-heading" id="bookshelf-heading">
              我的書架
            </h2>
          </div>
          <p className="section-heading-note">
            {!hasBookshelfSearch
              ? `${books.length} 本`
              : `${visibleBooks.length} / ${books.length} 本`}
          </p>
        </div>

        <div className="library-search">
          <label
            className="library-search-label"
            htmlFor="library-bookshelf-search"
          >
            搜尋我的書架
          </label>
          <div className="library-search-controls">
            <input
              className="library-search-input"
              id="library-bookshelf-search"
              placeholder="搜尋書名或作者"
              type="search"
              value={bookshelfSearch}
              onChange={(event) => setBookshelfSearch(event.target.value)}
            />
            {hasBookshelfSearch && (
              <button
                className="button-secondary library-search-clear"
                type="button"
                onClick={() => setBookshelfSearch('')}
              >
                清除搜尋
              </button>
            )}
          </div>
        </div>

        {books.length === 0 ? (
          <div className="library-empty-state" role="status">
            <p>還沒有收藏小說，從書城挑一本加入書架。</p>
            <button type="button" onClick={onBackToBookstore}>
              前往書城
            </button>
          </div>
        ) : visibleBooks.length === 0 ? (
          <div className="library-empty-state library-search-empty-state" role="status">
            <p>找不到符合條件的收藏</p>
          </div>
        ) : (
          <ul className="library-book-list">
            {visibleBooks.map((book) => (
              <LibraryBookCard
                book={book}
                key={book.book.id}
                onOpenBook={onOpenBook}
                onRemoveFromBookshelf={onRemoveFromBookshelf}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="recent-reading-heading"
        className="library-section"
      >
        <div className="section-heading-row">
          <div>
            <p className="section-kicker">回到最近打開的故事</p>
            <h2 className="section-heading" id="recent-reading-heading">
              最近閱讀
            </h2>
          </div>
          <p className="section-heading-note">依最近開啟排序</p>
        </div>

        {recentReading.length === 0 ? (
          <div className="library-empty-state" role="status">
            <p>開始閱讀後，最近看過的故事會出現在這裡。</p>
          </div>
        ) : (
          <ul className="library-recent-list">
            {recentReading.map((entry) => (
              <RecentReadingCard
                entry={entry}
                key={entry.book.book.id}
                onContinueBook={onContinueBook}
                onOpenBook={onOpenBook}
              />
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
