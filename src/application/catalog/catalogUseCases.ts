import { decideChapterAccess } from '../../domain/access/chapterAccessPolicy'
import type { Chapter } from '../../domain/catalog/chapter'
import type {
  ContentBook,
  ContentRepository,
} from './contentRepository'

export function listCatalog(
  contentRepository: ContentRepository,
): readonly ContentBook[] {
  return contentRepository.listBooks()
}

export function getBookDetail(
  contentRepository: ContentRepository,
  bookId: string,
): ContentBook | undefined {
  return contentRepository.getBook(bookId)
}

export function listGenres(books: readonly ContentBook[]): readonly string[] {
  const genres: string[] = []

  for (const { book } of books) {
    if (!genres.includes(book.categoryLabel)) {
      genres.push(book.categoryLabel)
    }
  }

  return genres
}

export interface CatalogQuery {
  readonly searchText?: string
  readonly genre?: string
}

export function filterCatalog(
  books: readonly ContentBook[],
  { searchText, genre }: CatalogQuery,
): readonly ContentBook[] {
  const normalizedQuery = searchText?.trim().toLowerCase() ?? ''

  return books.filter(({ book, description }) => {
    const matchesGenre = !genre || book.categoryLabel === genre
    const matchesQuery =
      normalizedQuery.length === 0 ||
      book.title.toLowerCase().includes(normalizedQuery) ||
      book.authorName.toLowerCase().includes(normalizedQuery) ||
      description.toLowerCase().includes(normalizedQuery)

    return matchesGenre && matchesQuery
  })
}

export interface ReadingDepthSummary {
  readonly totalChapters: number
  readonly openableChapters: number
  readonly continuousOpenableChapters: number
  readonly allOpenable: boolean
}

export function getReadingDepth(
  bookOrChapters: ContentBook | readonly Chapter[],
): ReadingDepthSummary {
  const chapters = Array.isArray(bookOrChapters)
    ? bookOrChapters
    : (bookOrChapters as ContentBook).chapters

  const totalChapters = chapters.length
  if (totalChapters === 0) {
    return {
      totalChapters: 0,
      openableChapters: 0,
      continuousOpenableChapters: 0,
      allOpenable: true,
    }
  }

  const sortedChapters = [...chapters].sort((a, b) => a.sequence - b.sequence)

  let openableChapters = 0
  let continuousOpenableChapters = 0
  let isContinuous = true

  for (const chapter of sortedChapters) {
    const access = decideChapterAccess(chapter.access)
    if (access.canOpen) {
      openableChapters += 1
      if (isContinuous) {
        continuousOpenableChapters += 1
      }
    } else {
      isContinuous = false
    }
  }

  const allOpenable = totalChapters > 0 && openableChapters === totalChapters

  return {
    totalChapters,
    openableChapters,
    continuousOpenableChapters,
    allOpenable,
  }
}

export function formatCatalogDepthLabel(depth: ReadingDepthSummary): string {
  if (depth.allOpenable) {
    return `${depth.totalChapters} 章可讀`
  }
  return `可讀 ${depth.openableChapters} / ${depth.totalChapters} 章`
}

export function formatBookDetailDepthSummary(
  depth: ReadingDepthSummary,
): string {
  if (depth.allOpenable) {
    return `目前 ${depth.totalChapters} 章皆可閱讀`
  }
  if (depth.openableChapters === depth.continuousOpenableChapters) {
    return `目前可連續閱讀前 ${depth.continuousOpenableChapters} 章`
  }
  return `目前有 ${depth.openableChapters} 章可閱讀`
}
