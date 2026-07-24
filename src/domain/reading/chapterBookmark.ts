import type { BookId, ChapterId } from '../catalog/identifiers'

export interface ChapterBookmark {
  readonly bookId: BookId
  readonly chapterId: ChapterId
}
