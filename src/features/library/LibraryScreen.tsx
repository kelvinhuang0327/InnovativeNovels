import { useState } from 'react'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type {
  BookmarkEntry,
  ChapterReadingNoteEntry,
  ContinueReadingEntry,
} from '../../application/reading/readingUseCases'
import {
  filterBookshelfBooks,
  filterSavedReadingItems,
  type RecentReadingEntry,
} from '../../application/library/libraryUseCases'
import { serializeReadingDataExport } from '../../application/reading/readingDataExport'
import { ContinueReadingShelf } from './ContinueReadingShelf'

interface LibraryScreenProps {
  readonly books: readonly ContentBook[]
  readonly bookmarks: readonly BookmarkEntry[]
  readonly notes: readonly ChapterReadingNoteEntry[]
  readonly recentReading: readonly RecentReadingEntry[]
  readonly continueReading: readonly ContinueReadingEntry[]
  readonly onBackToBookstore: () => void
  readonly onOpenBook: (bookId: string) => void
  readonly onContinueBook: (bookId: string) => void
  readonly onOpenBookmark: (position: BookmarkEntry['position']) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly onOpenReadingNote: (bookId: string, chapterId: string) => void
  readonly onRemoveReadingNote: (bookId: string, chapterId: string) => void
  readonly onRemoveFromBookshelf: (bookId: string) => void
}

type SavedItemsScope = 'all' | 'bookmarks' | 'notes'

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
  notes,
  recentReading,
  continueReading,
  onBackToBookstore,
  onOpenBook,
  onContinueBook,
  onOpenBookmark,
  onRemoveBookmark,
  onOpenReadingNote,
  onRemoveReadingNote,
  onRemoveFromBookshelf,
}: LibraryScreenProps) {
  const [bookshelfSearch, setBookshelfSearch] = useState('')
  const [savedItemsSearch, setSavedItemsSearch] = useState('')
