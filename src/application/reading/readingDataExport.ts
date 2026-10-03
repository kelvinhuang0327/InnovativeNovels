import type {
  BookmarkEntry,
  ChapterReadingNoteEntry,
} from './readingUseCases'

/**
 * Formats saved reading metadata as a human-readable plain-text document.
 * Chapter prose is intentionally not part of either input record.
 */
export function serializeReadingDataExport(
  bookmarks: readonly BookmarkEntry[],
  notes: readonly ChapterReadingNoteEntry[],
): string {
  const sections: string[] = []

  if (bookmarks.length > 0) {
    const records = bookmarks.map(
      ({ book, chapter, position }, index) =>
        [
          `書籤 ${index + 1}`,
          `書名：${book.book.title}`,
          `章名：${chapter.title}`,
          `bookId：${position.bookId}`,
          `chapterId：${position.chapterId}`,
          `paragraphIndex：${position.paragraphIndex}`,
          `chapterProgress：${position.chapterProgress}`,
        ].join('\n'),
    )

    sections.push(`章節書籤（${bookmarks.length}）\n${records.join('\n\n')}`)
  }

  if (notes.length > 0) {
    const records = notes.map(
      ({ book, chapter, note }, index) =>
        [
          `筆記 ${index + 1}`,
          `書名：${book.book.title}`,
          `章名：${chapter.title}`,
          '筆記內容：',
          note.content,
          '—— 筆記結束 ——',
        ].join('\n'),
    )

    sections.push(`章節筆記（${notes.length}）\n${records.join('\n\n')}`)
  }

  return sections.join('\n\n')
}
