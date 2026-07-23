import { describe, expect, it } from 'vitest'
import bookDetailSource from '../features/book-detail/BookDetailScreen.tsx?raw'
import catalogSource from '../features/catalog/CatalogScreen.tsx?raw'
import continueReadingShelfSource from '../features/library/ContinueReadingShelf.tsx?raw'
import pwaControlsSource from '../features/pwa/PwaControls.tsx?raw'
import readerSource from '../features/reader/ReaderScreen.tsx?raw'
import browserPwaAdapterSource from '../infrastructure/pwa/browserPwaAdapter.ts?raw'
import serviceWorkerAdapterSource from '../infrastructure/pwa/viteServiceWorkerAdapter.ts?raw'

const featureFiles = [
  ['CatalogScreen.tsx', catalogSource],
  ['BookDetailScreen.tsx', bookDetailSource],
  ['ReaderScreen.tsx', readerSource],
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
})
