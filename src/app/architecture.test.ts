import { describe, expect, it } from 'vitest'
import usePwaControllerSource from '../application/pwa/usePwaController.ts?raw'
import bookDetailSource from '../features/book-detail/BookDetailScreen.tsx?raw'
import catalogSource from '../features/catalog/CatalogScreen.tsx?raw'
import continueReadingShelfSource from '../features/library/ContinueReadingShelf.tsx?raw'
import pwaControlsSource from '../features/pwa/PwaControls.tsx?raw'
import bookmarksModalSource from '../features/reader/ChapterBookmarksModal.tsx?raw'
import comfortControlsSource from '../features/reader/ReaderComfortControls.tsx?raw'
import readerSource from '../features/reader/ReaderScreen.tsx?raw'
import tocModalSource from '../features/reader/TableOfContentsModal.tsx?raw'
import browserPwaAdapterSource from '../infrastructure/pwa/browserPwaAdapter.ts?raw'
import serviceWorkerAdapterSource from '../infrastructure/pwa/viteServiceWorkerAdapter.ts?raw'

const featureFiles = [
  ['CatalogScreen.tsx', catalogSource],
  ['BookDetailScreen.tsx', bookDetailSource],
  ['ReaderScreen.tsx', readerSource],
  ['ReaderComfortControls.tsx', comfortControlsSource],
  ['ChapterBookmarksModal.tsx', bookmarksModalSource],
  ['TableOfContentsModal.tsx', tocModalSource],
  ['ContinueReadingShelf.tsx', continueReadingShelfSource],
  ['PwaControls.tsx', pwaControlsSource],
]

describe('feature boundaries', () => {
  it('keeps browser storage access out of UI components', () => {
    for (const [fileName, source] of featureFiles) {
      expect(source, fileName).not.toMatch(/\blocalStorage\b/)
    }
  })

  it('keeps genre and search matching logic out of feature components', () => {
    for (const [fileName, source] of featureFiles) {
      expect(source, fileName).not.toMatch(/categoryLabel\s*===/)
      expect(source, fileName).not.toMatch(/toLowerCase\(\)\.includes/)
    }
  })

  it('keeps Service Worker registration and CacheStorage out of feature UI', () => {
    expect(pwaControlsSource).not.toMatch(/\bregisterSW\b/)
    expect(pwaControlsSource).not.toMatch(/\bserviceWorker\.register\b/)
    expect(pwaControlsSource).not.toMatch(/\bcaches\b|\bCacheStorage\b/)
    expect(serviceWorkerAdapterSource).toMatch(/\bregisterSW\b/)
    expect(browserPwaAdapterSource).not.toMatch(/\blocalStorage\b/)
  })

  it('keeps platform/capability detection out of PWA feature UI', () => {
    expect(pwaControlsSource).not.toMatch(/\bnavigator\b/)
    expect(pwaControlsSource).not.toMatch(/\buserAgent\b/)
    expect(pwaControlsSource).not.toMatch(/\bplatform\b/)
    expect(pwaControlsSource).not.toMatch(/\bmaxTouchPoints\b/)
    expect(browserPwaAdapterSource).toMatch(/\bdetectIosManualInstallEligibility\b/)
  })

  it('keeps manual install guidance dismissal free of persistence', () => {
    expect(usePwaControllerSource).not.toMatch(/\blocalStorage\b/)
    expect(usePwaControllerSource).not.toMatch(/ReadingState/)
  })
})
