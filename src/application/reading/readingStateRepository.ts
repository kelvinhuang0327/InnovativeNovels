import type { ReadingPosition } from '../../domain/reading/readingPosition'

export interface ReadingStateRepository {
  load(bookId: string): ReadingPosition | undefined
  save(position: ReadingPosition): void
}
