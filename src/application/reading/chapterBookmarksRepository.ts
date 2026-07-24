import type { ChapterBookmark } from '../../domain/reading/chapterBookmark'

export interface ChapterBookmarksRepository {
  list(): readonly ChapterBookmark[]
  add(bookmark: ChapterBookmark): void
  remove(bookId: string, chapterId: string): void
}
