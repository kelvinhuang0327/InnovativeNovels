import type { BookId, ChapterId } from '../catalog/identifiers'

export interface ChapterReadingNote {
  readonly bookId: BookId
  readonly chapterId: ChapterId
  readonly content: string
}
