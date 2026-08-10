import type { Book } from '../../domain/catalog/book'
import type { Chapter } from '../../domain/catalog/chapter'

export interface ContentBook {
  readonly book: Book
  readonly catalogSequence?: number
  readonly description: string
  readonly chapters: readonly Chapter[]
}

export interface ContentRepository {
  listBooks(): readonly ContentBook[]
  getBook(bookId: string): ContentBook | undefined
  getChapterProse(chapterId: string): readonly string[] | undefined
}
