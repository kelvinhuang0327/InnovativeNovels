import type { BookId, ChapterId } from '../catalog/identifiers'

export interface ReadingPosition {
  readonly bookId: BookId
  readonly chapterId: ChapterId
  readonly paragraphIndex: number
  readonly chapterProgress: number
}
