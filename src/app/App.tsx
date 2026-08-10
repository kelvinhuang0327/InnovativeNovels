import { useState } from 'react'
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
import type { ChapterBookmarksRepository } from '../application/reading/chapterBookmarksRepository'
import type { ReaderPreferencesRepository } from '../application/reading/readerPreferencesRepository'
import {
  addChapterBookmark,
  canNavigateToAdjacentChapter,
  describeChapterPosition,
  isChapterBookmarked,
  listChapterBookmarks,
  listContinueReading,
  listTableOfContents,
  navigateToAdjacentChapter,
  openReadingChapter,
  recoverActiveReaderSession,
  removeChapterBookmark,
  resolveStartOrContinue,
  updateReadingProgress,
  type BookmarkEntry,
  type OpenedChapter,
} from '../application/reading/readingUseCases'
import type { ActiveReaderSessionRepository } from '../application/reading/activeReaderSessionRepository'
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
import { AuthoringPreviewScreen } from '../features/authoring/AuthoringPreviewScreen'
import { CatalogScreen } from '../features/catalog/CatalogScreen'
import { PwaControls } from '../features/pwa/PwaControls'
import { ReaderScreen } from '../features/reader/ReaderScreen'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import { parseContentBookFixture } from '../infrastructure/content/catalogContentContract'
import { BrowserClipboardAdapter } from '../infrastructure/authoring/browserClipboardAdapter'
import { BrowserPortableProjectFileAdapter } from '../infrastructure/authoring/browserPortableProjectFileAdapter'
import { LocalStorageActiveReaderSessionRepository } from '../infrastructure/persistence/localStorageActiveReaderSessionRepository'
import { LocalStorageAuthoringSessionRepository } from '../infrastructure/persistence/localStorageAuthoringSessionRepository'
import { LocalStorageAuthoringProjectRepository } from '../infrastructure/persistence/localStorageAuthoringProjectRepository'
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
  | { readonly name: 'authoring' }
  | {
      readonly name: 'book-detail'
      readonly bookId: string
      readonly sessionReturnStatus?: string
    }
  | {
      readonly name: 'reader'
      readonly openedChapter: OpenedChapter
      readonly recoveryStatus?: string
    }

const defaultContentRepository = new StaticContentRepository()
const defaultAuthoringGatewayClient = new AuthoringGatewayClientAdapter()
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
    activeReaderSessionRepository: new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    ),
    authoringSessionRepository: new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    ),
    authoringProjectRepository: new LocalStorageAuthoringProjectRepository(
      window.localStorage,
    ),
    clipboardPort: new BrowserClipboardAdapter(window.navigator.clipboard),
    portableProjectFilePort: new BrowserPortableProjectFileAdapter(),
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
  const activeSessionRepo =
    dependencies.activeReaderSessionRepository ??
    new MemoryActiveReaderSessionRepository()
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

  const openReaderChapter = (
    targetBookId: string,
    targetChapterId: string,
  ) => {
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
      activeSessionRepo.save(openedChapter.book.book.id)
      setScreen({ name: 'reader', openedChapter })
    }
  }

  const handleJumpBookmark = (targetBookId: string, targetChapterId: string) => {
    openReaderChapter(targetBookId, targetChapterId)
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
      activeSessionRepo.save(openedChapter.book.book.id)
      setScreen({ name: 'reader', openedChapter })
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

    const openedChapter = navigateToAdjacentChapter(
      dependencies.contentRepository,
      dependencies.readingStateRepository,
      screen.openedChapter,
      direction,
    )

    if (openedChapter && !openedChapter.isLocked) {
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
          onOpenAuthoring={() => setScreen({ name: 'authoring' })}
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
              sessionReturnStatus={screen.sessionReturnStatus}
              onBack={() => setScreen({ name: 'catalog' })}
              onRead={() => openReader(screen.bookId)}
              onReadChapter={(chapterId) =>
                openReaderChapter(screen.bookId, chapterId)
              }
            />
          )
        })()}

      {screen.name === 'reader' && (
        <ReaderScreen
          openedChapter={screen.openedChapter}
          recoveryStatus={screen.recoveryStatus}
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
          onBackToBook={() => {
            activeSessionRepo.clear()
            setScreen({
              name: 'book-detail',
              bookId: screen.openedChapter.book.book.id,
              sessionReturnStatus: `閱讀位置已保留在 ${screen.openedChapter.chapter.title}`,
            })
          }}
          onPrevious={() => navigateReader(-1)}
          onNext={() => navigateReader(1)}
          canNavigateNextChapter={canNavigateToAdjacentChapter(
            screen.openedChapter,
            1,
          )}
          onProgressChange={handleProgressChange}
        />
      )}
    </main>
  )
}

export default App
