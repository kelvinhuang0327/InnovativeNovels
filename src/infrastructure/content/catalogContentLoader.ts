import type { ContentBook } from '../../application/catalog/contentRepository'
import {
  ContentImportError,
  parseContentBookFixture,
} from './catalogContentContract'

export interface LoadedCatalogContent {
  readonly books: readonly ContentBook[]
  readonly proseByChapterId: ReadonlyMap<string, readonly string[]>
}

export function loadCatalogContent(
  modules: Record<string, unknown>,
): LoadedCatalogContent {
  const parsedFixtures = Object.entries(modules).map(([fixturePath, raw]) =>
    ({
      fixturePath,
      parsed: parseContentBookFixture(fixturePath, raw),
    }),
  )

  const seenBookIds = new Map<string, string>()
  const seenCatalogSequences = new Map<number, string>()
  const seenChapterIds = new Map<string, string>()

  for (const { fixturePath, parsed } of parsedFixtures) {
    const bookIdValue = parsed.book.id as string

    const existingBookPath = seenBookIds.get(bookIdValue)
    if (existingBookPath) {
      throw new ContentImportError(fixturePath, 'DUPLICATE_BOOK_ID', 'bookId')
    }
    seenBookIds.set(bookIdValue, fixturePath)

    const existingSequencePath = seenCatalogSequences.get(
      parsed.catalogSequence,
    )
    if (existingSequencePath) {
      throw new ContentImportError(
        fixturePath,
        'DUPLICATE_CATALOG_SEQUENCE',
        'catalogSequence',
      )
    }
    seenCatalogSequences.set(parsed.catalogSequence, fixturePath)

    for (const { chapter } of parsed.chapters) {
      const chapterIdValue = chapter.id as string
      const existingChapterPath = seenChapterIds.get(chapterIdValue)
      if (existingChapterPath) {
        throw new ContentImportError(
          fixturePath,
          'DUPLICATE_CHAPTER_ID',
          'chapters[].chapterId',
        )
      }
      seenChapterIds.set(chapterIdValue, fixturePath)
    }
  }

  const orderedFixtures = [...parsedFixtures].sort(
    (left, right) => left.parsed.catalogSequence - right.parsed.catalogSequence,
  )

  const proseByChapterId = new Map<string, readonly string[]>()
  const books: ContentBook[] = orderedFixtures.map(({ parsed }) => {
    for (const { chapter, prose } of parsed.chapters) {
      if (prose) {
        proseByChapterId.set(chapter.id as string, prose)
      }
    }

    return {
      book: parsed.book,
      description: parsed.description,
      chapters: parsed.chapters.map(({ chapter }) => chapter),
    }
  })

  return { books, proseByChapterId }
}

export function loadProductionCatalogContent(): LoadedCatalogContent {
  const modules = import.meta.glob('./books/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>

  return loadCatalogContent(modules)
}
