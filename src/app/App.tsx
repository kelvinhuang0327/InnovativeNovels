import { useState } from 'react'
import {
  getBookDetail,
  listCatalog,
} from '../application/catalog/catalogUseCases'
import type { ContentRepository } from '../application/catalog/contentRepository'
import {
  listContinueReading,
  navigateToAdjacentChapter,
  openReadingChapter,
  resolveStartOrContinue,
  type OpenedChapter,
} from '../application/reading/readingUseCases'
import type { ReadingStateRepository } from '../application/reading/readingStateRepository'
import type { PwaDependencies } from '../application/pwa/pwaPorts'
import { usePwaController } from '../application/pwa/usePwaController'
import { BookDetailScreen } from '../features/book-detail/BookDetailScreen'
import { CatalogScreen } from '../features/catalog/CatalogScreen'
import { PwaControls } from '../features/pwa/PwaControls'
import { ReaderScreen } from '../features/reader/ReaderScreen'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import { LocalStorageReadingStateRepository } from '../infrastructure/persistence/localStorageReadingStateRepository'
import { BrowserPwaAdapter } from '../infrastructure/pwa/browserPwaAdapter'
import { ViteServiceWorkerAdapter } from '../infrastructure/pwa/viteServiceWorkerAdapter'
import './App.css'

export interface AppDependencies {
  readonly contentRepository: ContentRepository
  readonly readingStateRepository: ReadingStateRepository
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

function createDefaultDependencies(): AppDependencies {
  return {
    contentRepository: defaultContentRepository,
    readingStateRepository: new LocalStorageReadingStateRepository(
      window.localStorage,
    ),
  }
}

function App({
  dependencies = createDefaultDependencies(),
  pwaDependencies = defaultPwaDependencies,
}: AppProps) {
  const [screen, setScreen] = useState<Screen>({ name: 'catalog' })
  const pwa = usePwaController(pwaDependencies)

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
