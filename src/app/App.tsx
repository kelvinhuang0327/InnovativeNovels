import { useState } from 'react'
import {
  getBookDetail,
  listCatalog,
} from '../application/catalog/catalogUseCases'
import type { ContentRepository } from '../application/catalog/contentRepository'
import type { ChapterBookmarksRepository } from '../application/reading/chapterBookmarksRepository'
import type { ReaderPreferencesRepository } from '../application/reading/readerPreferencesRepository'
import {
  addChapterBookmark,
  describeChapterPosition,
  isChapterBookmarked,
  listChapterBookmarks,
  listContinueReading,
  listTableOfContents,
  navigateToAdjacentChapter,
  openReadingChapter,
  removeChapterBookmark,
  resolveStartOrContinue,
  type BookmarkEntry,
  type OpenedChapter,
} from '../application/reading/readingUseCases'
import type { ReadingStateRepository } from '../application/reading/readingStateRepository'
import type { PwaDependencies } from '../application/pwa/pwaPorts'
import { usePwaController } from '../application/pwa/usePwaController'
import { bookId as toBookId, chapterId as toChapterId } from '../domain/catalog/identifiers'
import type { ChapterBookmark } from '../domain/reading/chapterBookmark'
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
} from '../domain/reading/readerPreferences'
import { BookDetailScreen } from '../features/book-detail/BookDetailScreen'
import { CatalogScreen } from '../features/catalog/CatalogScreen'
import { PwaControls } from '../features/pwa/PwaControls'
import { ReaderScreen } from '../features/reader/ReaderScreen'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import { LocalStorageChapterBookmarksRepository } from '../infrastructure/persistence/localStorageChapterBookmarksRepository'
import { LocalStorageReaderPreferencesRepository } from '../infrastructure/persistence/localStorageReaderPreferencesRepository'
import { LocalStorageReadingStateRepository } from '../infrastructure/persistence/localStorageReadingStateRepository'
import { BrowserPwaAdapter } from '../infrastructure/pwa/browserPwaAdapter'
import { ViteServiceWorkerAdapter } from '../infrastructure/pwa/viteServiceWorkerAdapter'
import './App.css'

export interface AppDependencies {
  readonly contentRepository: ContentRepository
  readonly readingStateRepository: ReadingStateRepository
  readonly readerPreferencesRepository?: ReaderPreferencesRepository
  readonly chapterBookmarksRepository?: ChapterBookmarksRepository
}

interface AppProps {
  readonly dependencies?: AppDependencies
  readonly pwaDependencies?: PwaDependencies
}

type Screen =
  | { readonly name: 'catalog' }
  | { readonly name: 'book-detail'; readonly bookId: string }
  | { readonly name: 'reader'; readonly openedChapter: OpenedChapter }

const defaultContentRepository = new StaticContentRepository()
const defaultPwaDependencies: PwaDependencies = {
  browser: new BrowserPwaAdapter(window, window.navigator),
  serviceWorker: new ViteServiceWorkerAdapter(),
}

class MemoryPreferencesRepository implements ReaderPreferencesRepository {
  private prefs: ReaderPreferences = DEFAULT_READER_PREFERENCES
  load(): ReaderPreferences {
    return this.prefs
  }
  save(preferences: ReaderPreferences): void {
    this.prefs = preferences
  }
}

class MemoryBookmarksRepository implements ChapterBookmarksRepository {
  private items: ChapterBookmark[] = []
  list(): readonly ChapterBookmark[] {
    return this.items
  }
  add(bookmark: ChapterBookmark): void {
    if (
      !this.items.some(
        (i) => i.bookId === bookmark.bookId && i.chapterId === bookmark.chapterId,
      )
    ) {
      this.items.push(bookmark)
    }
  }
  remove(bookId: string, chapterId: string): void {
    this.items = this.items.filter(
      (i) => !(i.bookId === bookId && i.chapterId === chapterId),
    )
  }
}

function createDefaultDependencies(): AppDependencies {
  return {
    contentRepository: defaultContentRepository,
    readingStateRepository: new LocalStorageReadingStateRepository(
      window.localStorage,
    ),
    readerPreferencesRepository: new LocalStorageReaderPreferencesRepository(
      window.localStorage,
    ),
    chapterBookmarksRepository: new LocalStorageChapterBookmarksRepository(
      window.localStorage,
    ),
  }
}

function App({
  dependencies = createDefaultDependencies(),
  pwaDependencies = defaultPwaDependencies,
}: AppProps) {
  const prefRepo =
    dependencies.readerPreferencesRepository ??
    new MemoryPreferencesRepository()
  const bookmarkRepo =
    dependencies.chapterBookmarksRepository ?? new MemoryBookmarksRepository()

  const [screen, setScreen] = useState<Screen>({ name: 'catalog' })
  const [preferences, setPreferences] = useState<ReaderPreferences>(() =>
    prefRepo.load(),
  )
  const [bookmarks, setBookmarks] = useState<readonly BookmarkEntry[]>(() =>
    listChapterBookmarks(dependencies.contentRepository, bookmarkRepo),
  )

  const pwa = usePwaController(pwaDependencies)

  const handleUpdatePreferences = (newPrefs: ReaderPreferences) => {
    prefRepo.save(newPrefs)
    setPreferences(newPrefs)
  }

  const handleResetPreferences = () => {
    prefRepo.save(DEFAULT_READER_PREFERENCES)
    setPreferences(DEFAULT_READER_PREFERENCES)
  }

  const refreshBookmarks = () => {
    setBookmarks(
      listChapterBookmarks(dependencies.contentRepository, bookmarkRepo),
    )
  }

  const handleToggleBookmark = (bookId: string, chapterId: string) => {
    if (isChapterBookmarked(bookmarkRepo, bookId, chapterId)) {
      removeChapterBookmark(bookmarkRepo, bookId, chapterId)
    } else {
      addChapterBookmark(
        dependencies.contentRepository,
        bookmarkRepo,
        bookId,
        chapterId,
      )
    }
    refreshBookmarks()
  }

  const handleRemoveBookmark = (bookId: string, chapterId: string) => {
    removeChapterBookmark(bookmarkRepo, bookId, chapterId)
    refreshBookmarks()
  }

  const handleJumpBookmark = (targetBookId: string, targetChapterId: string) => {
    const openedChapter = openReadingChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      {
        bookId: toBookId(targetBookId),
        chapterId: toChapterId(targetChapterId),
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    )

    if (openedChapter) {
      setScreen({ name: 'reader', openedChapter })
    }
  }

  const openBookDetail = (bookId: string) => {
    setScreen({ name: 'book-detail', bookId })
  }

  const openReader = (bookId: string) => {
    const destination = resolveStartOrContinue(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      bookId,
    )

    if (!destination) {
      return
    }

    const openedChapter = openReadingChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      destination.position,
    )

    if (openedChapter) {
      setScreen({ name: 'reader', openedChapter })
    }
  }

  const navigateReader = (direction: -1 | 1) => {
    if (screen.name !== 'reader') {
      return
    }

    const openedChapter = navigateToAdjacentChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      screen.openedChapter,
      direction,
    )

    if (openedChapter) {
      setScreen({ name: 'reader', openedChapter })
    }
  }

  return (
    <main className="app-shell">
      <p className="eyebrow">InnovativeNovels</p>
      <PwaControls {...pwa} />

      {screen.name === 'catalog' && (
        <CatalogScreen
          books={listCatalog(dependencies.contentRepository)}
          continueReading={listContinueReading(
            dependencies.contentRepository,
            dependencies.readingStateRepository,
          )}
          onContinueBook={openReader}
          onOpenBook={openBookDetail}
        />
      )}

      {screen.name === 'book-detail' &&
        (() => {
          const book = getBookDetail(
            dependencies.contentRepository,
            screen.bookId,
          )

          if (!book) {
            return null
          }

          const destination = resolveStartOrContinue(
            dependencies.contentRepository,
            dependencies.readingStateRepository,
            screen.bookId,
          )

          return (
            <BookDetailScreen
              book={book}
              hasSavedPosition={destination?.isContinuing ?? false}
              onBack={() => setScreen({ name: 'catalog' })}
              onRead={() => openReader(screen.bookId)}
            />
          )
        })()}

      {screen.name === 'reader' && (
        <ReaderScreen
          openedChapter={screen.openedChapter}
          preferences={preferences}
          isBookmarked={isChapterBookmarked(
            bookmarkRepo,
            screen.openedChapter.book.book.id,
            screen.openedChapter.chapter.id,
          )}
          bookmarks={bookmarks}
          tableOfContents={listTableOfContents(
            screen.openedChapter.book,
            screen.openedChapter.chapter.id,
          )}
          chapterPosition={describeChapterPosition(
            screen.openedChapter.book,
            screen.openedChapter.chapter.id,
          )}
          onChangePreferences={handleUpdatePreferences}
          onResetPreferences={handleResetPreferences}
          onToggleBookmark={() =>
            handleToggleBookmark(
              screen.openedChapter.book.book.id,
              screen.openedChapter.chapter.id,
            )
          }
          onSelectBookmark={handleJumpBookmark}
          onRemoveBookmark={handleRemoveBookmark}
          onSelectChapter={(targetChapterId) =>
            handleJumpBookmark(
              screen.openedChapter.book.book.id,
              targetChapterId,
            )
          }
          onBackToBook={() =>
            setScreen({
              name: 'book-detail',
              bookId: screen.openedChapter.book.book.id,
            })
          }
          onPrevious={() => navigateReader(-1)}
          onNext={() => navigateReader(1)}
        />
      )}
    </main>
  )
}

export default App
