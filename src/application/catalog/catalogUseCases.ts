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
