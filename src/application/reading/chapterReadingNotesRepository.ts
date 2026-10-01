import type { ChapterReadingNote } from '../../domain/reading/chapterReadingNote'

export interface ChapterReadingNotesRepository {
  load(bookId: string, chapterId: string): ChapterReadingNote | undefined
  save(note: ChapterReadingNote): void
  remove(bookId: string, chapterId: string): void
}
