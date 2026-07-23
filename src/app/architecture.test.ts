import { describe, expect, it } from 'vitest'
import bookDetailSource from '../features/book-detail/BookDetailScreen.tsx?raw'
import catalogSource from '../features/catalog/CatalogScreen.tsx?raw'
import continueReadingShelfSource from '../features/library/ContinueReadingShelf.tsx?raw'
import readerSource from '../features/reader/ReaderScreen.tsx?raw'

const featureFiles = [
  ['CatalogScreen.tsx', catalogSource],
  ['BookDetailScreen.tsx', bookDetailSource],
  ['ReaderScreen.tsx', readerSource],
  ['ContinueReadingShelf.tsx', continueReadingShelfSource],
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
})
