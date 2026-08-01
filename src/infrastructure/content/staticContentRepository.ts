import type {
  ContentBook,
  ContentRepository,
} from '../../application/catalog/contentRepository'
import { loadProductionCatalogContent } from './catalogContentLoader'

const { books, proseByChapterId } = loadProductionCatalogContent()

const booksById = new Map(
  books.map((entry) => [entry.book.id as string, entry]),
)

export class StaticContentRepository implements ContentRepository {
  listBooks(): readonly ContentBook[] {
    return books
  }

  getBook(requestedBookId: string): ContentBook | undefined {
    return booksById.get(requestedBookId)
  }

  getChapterProse(requestedChapterId: string): readonly string[] | undefined {
    return proseByChapterId.get(requestedChapterId)
  }
}
