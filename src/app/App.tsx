import { useState, useSyncExternalStore } from 'react'
import {
  getBookDetail,
  listCatalog,
} from '../application/catalog/catalogUseCases'
import type { ContentRepository } from '../application/catalog/contentRepository'
import type { AuthoringGatewayClient } from '../application/authoring/authoringGatewayClient'
import { AuthoringGatewayClientAdapter } from '../application/authoring/authoringGatewayClient'
import type { AuthoringProjectRepository } from '../application/authoring/authoringProjectRepository'
import type {
  AuthoringSession,
  AuthoringSessionRepository,
} from '../application/authoring/authoringSessionRepository'
import type { ClipboardPort } from '../application/authoring/clipboardPort'
import type { PortableProjectFilePort } from '../application/authoring/portableProjectFilePort'
import {
  addBookToBookshelf,
  listBookshelfFromBookIds,
  listRecentReadingFromBookIds,
  removeBookFromBookshelf,
  touchRecentReading,
} from '../application/library/libraryUseCases'
import type { BookShelfRepository } from '../application/library/bookShelfRepository'
import type { RecentReadingRepository } from '../application/library/recentReadingRepository'
import type { ChapterBookmarksRepository } from '../application/reading/chapterBookmarksRepository'
import type { ChapterReadingNotesRepository } from '../application/reading/chapterReadingNotesRepository'
import type { ReaderPreferencesRepository } from '../application/reading/readerPreferencesRepository'
import {
  addChapterBookmark,
  canNavigateToAdjacentChapter,
  describeChapterPosition,
  getChapterReadingNote,
  isChapterBookmarked,
  listChapterBookmarks,
  listChapterReadingNotes,
  listContinueReading,
  listTableOfContents,
  navigateToAdjacentChapter,
  openReadingChapter,
  recoverActiveReaderSession,
  removeChapterBookmark,
  removeChapterReadingNote,
  resolveStartOrContinue,
  saveChapterReadingNote,
  searchBookText,
  updateReadingProgress,
  type BookmarkEntry,
  type BookTextSearchResult,
  type OpenedChapter,
} from '../application/reading/readingUseCases'
import type { ActiveReaderSessionRepository } from '../application/reading/activeReaderSessionRepository'
import type { ReadingStateRepository } from '../application/reading/readingStateRepository'
import type { PwaDependencies } from '../application/pwa/pwaPorts'
import { usePwaController } from '../application/pwa/usePwaController'
import { bookId as toBookId, chapterId as toChapterId } from '../domain/catalog/identifiers'
import type { ChapterBookmark } from '../domain/reading/chapterBookmark'
import type { ChapterReadingNote } from '../domain/reading/chapterReadingNote'
import type { ReadingPosition } from '../domain/reading/readingPosition'
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
} from '../domain/reading/readerPreferences'
import { BookDetailScreen } from '../features/book-detail/BookDetailScreen'
import { AuthoringPreviewScreen } from '../features/authoring/AuthoringPreviewScreen'
import { CatalogScreen } from '../features/catalog/CatalogScreen'
import { LibraryScreen } from '../features/library/LibraryScreen'
import { ConsumerNavigation } from '../features/navigation/ConsumerNavigation'
import { PwaControls } from '../features/pwa/PwaControls'
import { ReaderScreen } from '../features/reader/ReaderScreen'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import { parseContentBookFixture } from '../infrastructure/content/catalogContentContract'
import { BrowserClipboardAdapter } from '../infrastructure/authoring/browserClipboardAdapter'
import { BrowserPortableProjectFileAdapter } from '../infrastructure/authoring/browserPortableProjectFileAdapter'
import { LocalStorageActiveReaderSessionRepository } from '../infrastructure/persistence/localStorageActiveReaderSessionRepository'
import { LocalStorageAuthoringSessionRepository } from '../infrastructure/persistence/localStorageAuthoringSessionRepository'
import { LocalStorageAuthoringProjectRepository } from '../infrastructure/persistence/localStorageAuthoringProjectRepository'
import { LocalStorageBookShelfRepository } from '../infrastructure/persistence/localStorageBookShelfRepository'
import { LocalStorageChapterBookmarksRepository } from '../infrastructure/persistence/localStorageChapterBookmarksRepository'
import { LocalStorageChapterReadingNotesRepository } from '../infrastructure/persistence/localStorageChapterReadingNotesRepository'
import { LocalStorageReaderPreferencesRepository } from '../infrastructure/persistence/localStorageReaderPreferencesRepository'
import { LocalStorageRecentReadingRepository } from '../infrastructure/persistence/localStorageRecentReadingRepository'
import { LocalStorageReadingStateRepository } from '../infrastructure/persistence/localStorageReadingStateRepository'
import { ResilientBrowserStorage } from '../infrastructure/persistence/resilientBrowserStorage'
import { BrowserPwaAdapter } from '../infrastructure/pwa/browserPwaAdapter'
import { ViteServiceWorkerAdapter } from '../infrastructure/pwa/viteServiceWorkerAdapter'
import './App.css'

export interface AppDependencies {
  readonly contentRepository: ContentRepository
  readonly readingStateRepository: ReadingStateRepository
  readonly bookShelfRepository?: BookShelfRepository
  readonly recentReadingRepository?: RecentReadingRepository
  readonly readerPreferencesRepository?: ReaderPreferencesRepository
  readonly chapterBookmarksRepository?: ChapterBookmarksRepository
  readonly chapterReadingNotesRepository?: ChapterReadingNotesRepository
  readonly activeReaderSessionRepository?: ActiveReaderSessionRepository
  readonly authoringGatewayClient?: AuthoringGatewayClient
  readonly authoringProjectRepository?: AuthoringProjectRepository
  readonly authoringSessionRepository?: AuthoringSessionRepository
  readonly clipboardPort?: ClipboardPort
  readonly portableProjectFilePort?: PortableProjectFilePort
}

interface AppProps {
  readonly dependencies?: AppDependencies
  readonly pwaDependencies?: PwaDependencies
}

type Screen =
  | { readonly name: 'catalog' }
  | { readonly name: 'library' }
  | { readonly name: 'authoring' }
  | {
      readonly name: 'book-detail'
      readonly bookId: string
      readonly returnTo?: 'catalog' | 'library'
      readonly sessionReturnStatus?: string
    }
  | {
      readonly name: 'reader'
      readonly openedChapter: OpenedChapter
      readonly returnTo?: 'catalog' | 'library'
      readonly recoveryStatus?: string
      readonly searchTargetParagraphIndex?: number
      readonly chapterOpenFailure?: {
        readonly position: ReadingPosition
      }
    }

const defaultContentRepository = new StaticContentRepository()
const defaultAuthoringGatewayClient = new AuthoringGatewayClientAdapter()
const defaultBrowserStorage = new ResilientBrowserStorage(() => window.localStorage)
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

class MemoryChapterReadingNotesRepository
  implements ChapterReadingNotesRepository
{
  private readonly notes = new Map<string, ChapterReadingNote>()

  list(): readonly ChapterReadingNote[] {
    return [...this.notes.values()]
  }

  load(targetBookId: string, targetChapterId: string): ChapterReadingNote | undefined {
    return this.notes.get(JSON.stringify([targetBookId, targetChapterId]))
  }

  save(note: ChapterReadingNote): void {
    this.notes.set(JSON.stringify([note.bookId, note.chapterId]), note)
  }

  remove(targetBookId: string, targetChapterId: string): void {
    this.notes.delete(JSON.stringify([targetBookId, targetChapterId]))
  }
}

class MemoryBookShelfRepository implements BookShelfRepository {
  private bookIds: string[] = []

  list(): readonly string[] {
    return this.bookIds
  }

  contains(bookId: string): boolean {
    return this.bookIds.includes(bookId)
  }

  add(bookId: string): void {
    if (!this.bookIds.includes(bookId)) {
      this.bookIds = [...this.bookIds, bookId]
    }
  }

  remove(bookId: string): void {
    this.bookIds = this.bookIds.filter((savedBookId) => savedBookId !== bookId)
  }
}

class MemoryRecentReadingRepository implements RecentReadingRepository {
  private bookIds: string[] = []

  list(): readonly string[] {
    return this.bookIds
  }

  touch(bookId: string): void {
    this.bookIds = [
      bookId,
      ...this.bookIds.filter((recentBookId) => recentBookId !== bookId),
    ].slice(0, 20)
  }
}

class MemoryActiveReaderSessionRepository
  implements ActiveReaderSessionRepository
{
  private activeBookId: string | undefined = undefined
  load(): string | undefined {
    return this.activeBookId
  }
  save(bookId: string): void {
    this.activeBookId = bookId
  }
  clear(): void {
    this.activeBookId = undefined
  }
}

class MemoryAuthoringSessionRepository implements AuthoringSessionRepository {
  private session: AuthoringSession | undefined

  load(): AuthoringSession | undefined {
    return this.session
  }

  save(session: AuthoringSession): void {
    this.session = session
  }

  clear(): void {
    this.session = undefined
  }
}

function createDefaultDependencies(): AppDependencies {
  const storage = defaultBrowserStorage

  return {
    contentRepository: defaultContentRepository,
    readingStateRepository: new LocalStorageReadingStateRepository(
      storage,
    ),
    bookShelfRepository: new LocalStorageBookShelfRepository(
      storage,
    ),
    recentReadingRepository: new LocalStorageRecentReadingRepository(
      storage,
    ),
    readerPreferencesRepository: new LocalStorageReaderPreferencesRepository(
      storage,
    ),
    chapterBookmarksRepository: new LocalStorageChapterBookmarksRepository(
      storage,
    ),
    chapterReadingNotesRepository:
      new LocalStorageChapterReadingNotesRepository(storage),
    activeReaderSessionRepository: new LocalStorageActiveReaderSessionRepository(
      storage,
    ),
    authoringSessionRepository: new LocalStorageAuthoringSessionRepository(storage),
    authoringProjectRepository: new LocalStorageAuthoringProjectRepository(storage),
    clipboardPort: new BrowserClipboardAdapter(window.navigator.clipboard),
    portableProjectFilePort: new BrowserPortableProjectFileAdapter(),
  }
}

function App({
  dependencies: providedDependencies,
  pwaDependencies = defaultPwaDependencies,
}: AppProps) {
  const dependencies = providedDependencies ?? createDefaultDependencies()
  const prefRepo =
    dependencies.readerPreferencesRepository ??
    new MemoryPreferencesRepository()
  const bookmarkRepo =
    dependencies.chapterBookmarksRepository ?? new MemoryBookmarksRepository()
  const [memoryChapterReadingNotesRepo] = useState(
    () => new MemoryChapterReadingNotesRepository(),
  )
  const chapterReadingNotesRepo =
    dependencies.chapterReadingNotesRepository ?? memoryChapterReadingNotesRepo
  const activeSessionRepo =
    dependencies.activeReaderSessionRepository ??
    new MemoryActiveReaderSessionRepository()
  const [memoryBookShelfRepo] = useState(() => new MemoryBookShelfRepository())
  const bookShelfRepo =
    dependencies.bookShelfRepository ?? memoryBookShelfRepo
  const [memoryRecentReadingRepo] = useState(
    () => new MemoryRecentReadingRepository(),
  )
  const recentReadingRepo =
    dependencies.recentReadingRepository ?? memoryRecentReadingRepo
  const [memoryAuthoringSessionRepo] = useState(
    () => new MemoryAuthoringSessionRepository(),
  )
  const authoringSessionRepo =
    dependencies.authoringSessionRepository ?? memoryAuthoringSessionRepo

  const [screen, setScreen] = useState<Screen>(() => {
    const activeBookId = activeSessionRepo.load()

    if (!activeBookId) {
      return { name: 'catalog' }
    }

    const openedChapter = recoverActiveReaderSession(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      activeBookId,
    )

    if (!openedChapter) {
      activeSessionRepo.clear()
      return { name: 'catalog' }
    }

    recentReadingRepo.touch(openedChapter.book.book.id)

    return {
      name: 'reader',
      openedChapter,
      recoveryStatus: `已恢復上次閱讀：${openedChapter.chapter.title}`,
    }
  })
  const [preferences, setPreferences] = useState<ReaderPreferences>(() =>
    prefRepo.load(),
  )
  const [bookmarks, setBookmarks] = useState<readonly BookmarkEntry[]>(() =>
    listChapterBookmarks(dependencies.contentRepository, bookmarkRepo),
  )
  const [libraryState, setLibraryState] = useState(() => ({
    savedBookIds: [...bookShelfRepo.list()],
    recentBookIds: [...recentReadingRepo.list()],
  }))
  const storageIsPersistent = useSyncExternalStore(
    defaultBrowserStorage.subscribe,
    defaultBrowserStorage.getSnapshot,
    () => true,
  )
  const isPersistentStorageAvailable =
    providedDependencies !== undefined || storageIsPersistent

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
        dependencies.readingStateRepository,
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

  const refreshLibraryState = () => {
    setLibraryState({
      savedBookIds: [...bookShelfRepo.list()],
      recentBookIds: [...recentReadingRepo.list()],
    })
  }

  const handleRemoveReadingNote = (bookId: string, chapterId: string) => {
    removeChapterReadingNote(chapterReadingNotesRepo, bookId, chapterId)
    refreshLibraryState()
  }

  const handleToggleBookshelf = (bookId: string) => {
    if (bookShelfRepo.contains(bookId)) {
      removeBookFromBookshelf(bookShelfRepo, bookId)
    } else {
      addBookToBookshelf(
        dependencies.contentRepository,
        bookShelfRepo,
        bookId,
      )
    }

    refreshLibraryState()
  }

  const recordRecentReading = (bookId: string) => {
    if (
      touchRecentReading(
        dependencies.contentRepository,
        recentReadingRepo,
        bookId,
      )
    ) {
      setLibraryState((current) => ({
        ...current,
        recentBookIds: [...recentReadingRepo.list()],
      }))
    }
  }

  const showReaderChapterOpenFailure = (position: ReadingPosition) => {
    if (screen.name !== 'reader') {
      return
    }

    setScreen({
      name: 'reader',
      openedChapter: screen.openedChapter,
      returnTo: screen.returnTo,
      chapterOpenFailure: {
        position,
      },
    })
  }

  const openReaderChapter = (
    position: ReadingPosition,
    returnTo: 'catalog' | 'library' = 'catalog',
    searchTargetParagraphIndex?: number,
  ) => {
    const openedChapter = openReadingChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      position,
    )

    if (openedChapter) {
      activeSessionRepo.save(openedChapter.book.book.id)
      recordRecentReading(openedChapter.book.book.id)
      setScreen({
        name: 'reader',
        openedChapter,
        returnTo,
        searchTargetParagraphIndex,
      })
    } else {
      showReaderChapterOpenFailure(position)
    }
  }

  const handleJumpBookmark = (position: ReadingPosition) => {
    const returnTo: 'catalog' | 'library' =
      screen.name === 'reader'
        ? screen.returnTo ?? 'catalog'
        : screen.name === 'library'
          ? 'library'
          : 'catalog'
    openReaderChapter(position, returnTo)
  }

  const handleOpenReadingNote = (bookId: string, chapterId: string) => {
    const savedPosition = dependencies.readingStateRepository.load(bookId)
    const position =
      savedPosition?.bookId === bookId && savedPosition.chapterId === chapterId
        ? savedPosition
        : {
            bookId: toBookId(bookId),
            chapterId: toChapterId(chapterId),
            paragraphIndex: 0,
            chapterProgress: 0,
          }

    openReaderChapter(position, 'library')
  }

  const openBookDetail = (
    bookId: string,
    returnTo: 'catalog' | 'library' = 'catalog',
  ) => {
    setScreen({ name: 'book-detail', bookId, returnTo })
  }

  const openReader = (
    bookId: string,
    returnTo: 'catalog' | 'library' = 'catalog',
  ) => {
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
      activeSessionRepo.save(openedChapter.book.book.id)
      recordRecentReading(openedChapter.book.book.id)
      setScreen({ name: 'reader', openedChapter, returnTo })
    }
  }

  const handleProgressChange = (chapterProgress: number) => {
    if (screen.name !== 'reader') {
      return
    }

    updateReadingProgress(dependencies.readingStateRepository, {
      bookId: screen.openedChapter.book.book.id,
      chapterId: screen.openedChapter.chapter.id,
      paragraphIndex: 0,
      chapterProgress,
    })
  }

  const navigateReader = (direction: -1 | 1) => {
    if (screen.name !== 'reader') {
      return
    }

    const orderedChapters = [...screen.openedChapter.book.chapters].sort(
      (left, right) => left.sequence - right.sequence,
    )
    const currentChapterIndex = orderedChapters.findIndex(
      (chapter) => chapter.id === screen.openedChapter.chapter.id,
    )
    const attemptedChapter = orderedChapters[currentChapterIndex + direction]
    const openedChapter = navigateToAdjacentChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      screen.openedChapter,
      direction,
    )

    if (openedChapter && !openedChapter.isLocked) {
      setScreen({
        name: 'reader',
        openedChapter,
        returnTo: screen.returnTo,
      })
    } else if (!openedChapter && attemptedChapter) {
      showReaderChapterOpenFailure({
        bookId: toBookId(screen.openedChapter.book.book.id),
        chapterId: toChapterId(attemptedChapter.id),
        paragraphIndex: 0,
        chapterProgress: 0,
      })
    }
  }

  const bookshelfBooks = listBookshelfFromBookIds(
    dependencies.contentRepository,
    libraryState.savedBookIds,
  )
  const recentReading = listRecentReadingFromBookIds(
    dependencies.contentRepository,
    libraryState.recentBookIds,
    dependencies.readingStateRepository,
  )
  const consumerDestination =
    screen.name === 'catalog' || screen.name === 'library'
      ? screen.name
      : undefined

  return (
    <main
      className={`app-shell${
        consumerDestination ? ' app-shell--with-consumer-navigation' : ''
      }`}
    >
      <p className="eyebrow">InnovativeNovels</p>
      <PwaControls {...pwa} />
      {providedDependencies === undefined && !storageIsPersistent && (
        <p className="storage-fallback-notice" role="status">
          瀏覽器永久儲存目前不可用。閱讀進度、閱讀設定、書架、書籤與章節筆記只會暫存在目前分頁，重新整理或關閉後將無法還原。
        </p>
      )}

      {screen.name === 'catalog' && (
        <CatalogScreen
          books={listCatalog(dependencies.contentRepository)}
          continueReading={listContinueReading(
            dependencies.contentRepository,
            dependencies.readingStateRepository,
          )}
          onContinueBook={openReader}
          onOpenBook={openBookDetail}
          onOpenAuthoring={() => setScreen({ name: 'authoring' })}
        />
      )}

      {screen.name === 'library' && (
        <LibraryScreen
          books={bookshelfBooks}
          bookmarks={bookmarks}
          notes={listChapterReadingNotes(
            dependencies.contentRepository,
            chapterReadingNotesRepo,
          )}
          continueReading={listContinueReading(
            dependencies.contentRepository,
            dependencies.readingStateRepository,
          )}
          onBackToBookstore={() => setScreen({ name: 'catalog' })}
          onContinueBook={(bookId) => openReader(bookId, 'library')}
          onOpenBookmark={handleJumpBookmark}
          onOpenReadingNote={handleOpenReadingNote}
          onOpenBook={(bookId) => openBookDetail(bookId, 'library')}
          onRemoveBookmark={handleRemoveBookmark}
          onRemoveReadingNote={handleRemoveReadingNote}
          onRemoveFromBookshelf={handleToggleBookshelf}
          recentReading={recentReading}
        />
      )}

      {screen.name === 'authoring' && (
        <AuthoringPreviewScreen
          clipboardPort={dependencies.clipboardPort}
          gatewayClient={
            dependencies.authoringGatewayClient ?? defaultAuthoringGatewayClient
          }
          onBack={() => setScreen({ name: 'catalog' })}
          projectRepository={dependencies.authoringProjectRepository}
          portableProjectFilePort={dependencies.portableProjectFilePort}
          productionBooks={dependencies.contentRepository.listBooks()}
          productionChapterProse={(chapterId) =>
            dependencies.contentRepository.getChapterProse(chapterId)
          }
          validateProductionFixture={(fixture) =>
            parseContentBookFixture(`./books/${fixture.bookId}.json`, fixture)
          }
          sessionRepository={authoringSessionRepo}
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

          let continueChapterId: string | undefined = undefined
          let continueChapterTitle: string | undefined = undefined
          if (destination?.isContinuing) {
            const chapter = book.chapters.find(
              (c) => c.id === destination.position.chapterId,
            )
            if (chapter) {
              continueChapterId = chapter.id
              continueChapterTitle = chapter.title
            }
          }

          return (
            <BookDetailScreen
              book={book}
              hasSavedPosition={destination?.isContinuing ?? false}
              continueChapterId={continueChapterId}
              continueChapterTitle={continueChapterTitle}
              continueChapterProgress={
                destination?.isContinuing
                  ? destination.position.chapterProgress
                  : undefined
              }
              isInBookshelf={bookShelfRepo.contains(screen.bookId)}
              sessionReturnStatus={screen.sessionReturnStatus}
              onBack={() =>
                setScreen(
                  screen.returnTo === 'library'
                    ? { name: 'library' }
                    : { name: 'catalog' },
                )
              }
              onRead={() => openReader(screen.bookId, screen.returnTo)}
              onReadChapter={(chapterId) =>
                openReaderChapter(
                  {
                    bookId: toBookId(screen.bookId),
                    chapterId: toChapterId(chapterId),
                    paragraphIndex: 0,
                    chapterProgress: 0,
                  },
                  screen.returnTo,
                )
              }
              onToggleBookshelf={() =>
                handleToggleBookshelf(screen.bookId)
              }
              backButtonLabel={
                screen.returnTo === 'library' ? '返回我的書架' : '返回書庫'
              }
            />
          )
        })()}

      {screen.name === 'reader' && (
        <ReaderScreen
          openedChapter={screen.openedChapter}
          recoveryStatus={screen.recoveryStatus}
          chapterOpenFailed={screen.chapterOpenFailure !== undefined}
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
          isPersistentStorageAvailable={isPersistentStorageAvailable}
          onToggleBookmark={() =>
            handleToggleBookmark(
              screen.openedChapter.book.book.id,
              screen.openedChapter.chapter.id,
            )
          }
          onSelectBookmark={handleJumpBookmark}
          onRemoveBookmark={handleRemoveBookmark}
          loadChapterReadingNote={() =>
            getChapterReadingNote(
              chapterReadingNotesRepo,
              screen.openedChapter.book.book.id,
              screen.openedChapter.chapter.id,
            )?.content ?? ''
          }
          onSaveChapterReadingNote={(content) =>
            saveChapterReadingNote(
              chapterReadingNotesRepo,
              screen.openedChapter.book.book.id,
              screen.openedChapter.chapter.id,
              content,
            )
          }
          onSelectChapter={(targetChapterId) =>
            openReaderChapter(
              {
                bookId: toBookId(screen.openedChapter.book.book.id),
                chapterId: toChapterId(targetChapterId),
                paragraphIndex: 0,
                chapterProgress: 0,
              },
              screen.returnTo,
            )
          }
          searchBookText={(query) =>
            searchBookText(
              dependencies.contentRepository,
              screen.openedChapter.book,
              query,
            )
          }
          onSelectBookTextSearchResult={(result: BookTextSearchResult) =>
            openReaderChapter(
              {
                bookId: toBookId(screen.openedChapter.book.book.id),
                chapterId: toChapterId(result.chapterId),
                paragraphIndex: result.paragraphIndex,
                chapterProgress: 0,
              },
              screen.returnTo,
              result.paragraphIndex,
            )
          }
          searchTargetParagraphIndex={screen.searchTargetParagraphIndex}
          onBackToBook={() => {
            activeSessionRepo.clear()
            setScreen({
              name: 'book-detail',
              bookId: screen.openedChapter.book.book.id,
              returnTo: screen.returnTo,
              sessionReturnStatus: `閱讀位置已保留在 ${screen.openedChapter.chapter.title}`,
            })
          }}
          onPrevious={() => navigateReader(-1)}
          onNext={() => navigateReader(1)}
          onRetryChapterOpen={() => {
            const failure = screen.chapterOpenFailure
            if (failure) {
              openReaderChapter(
                failure.position,
                screen.returnTo,
              )
            }
          }}
          canNavigateNextChapter={canNavigateToAdjacentChapter(
            screen.openedChapter,
            1,
          )}
          onProgressChange={handleProgressChange}
        />
      )}

      {consumerDestination && (
        <ConsumerNavigation
          currentDestination={consumerDestination}
          onNavigate={(destination) =>
            setScreen(
              destination === 'library'
                ? { name: 'library' }
                : { name: 'catalog' },
            )
          }
        />
      )}
    </main>
  )
}

export default App
