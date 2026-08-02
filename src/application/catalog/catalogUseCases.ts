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
