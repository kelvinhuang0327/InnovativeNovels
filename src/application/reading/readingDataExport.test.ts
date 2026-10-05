import type { ContentBook } from '../catalog/contentRepository'
import { describe, expect, it } from 'vitest'
import type {
  BookmarkEntry,
  ChapterReadingNoteEntry,
} from './readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { serializeReadingDataExport } from './readingDataExport'

function makeBook(id: string, title: string): ContentBook {
  const typedBookId = bookId(id)
  const chapter = {
    id: chapterId(`${id}-chapter-1`),
    bookId: typedBookId,
    title: `${title} 第一章`,
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  }

  return {
    book: {
      id: typedBookId,
      title,
      authorName: '作者',
      categoryLabel: '分類',
    },
    description: '不可匯出的故事簡介',
    chapters: [chapter],
  }
}

function makeBookmark(book: ContentBook): BookmarkEntry {
  const chapter = book.chapters[0]

  return {
    book,
    chapter,
    position: {
      bookId: book.book.id,
      chapterId: chapter.id,
      paragraphIndex: 7,
      chapterProgress: 0.625,
    },
  }
}

function makeNote(book: ContentBook, content: string): ChapterReadingNoteEntry {
  const chapter = book.chapters[0]

  return {
    book,
    chapter,
    note: {
      bookId: book.book.id,
      chapterId: chapter.id,
      content,
    },
  }
}

describe('serializeReadingDataExport', () => {
  it('returns no document when there are no bookmarks or notes', () => {
    expect(serializeReadingDataExport([], [])).toBe('')
  })

  it('writes bookmark metadata and complete note text without chapter prose', () => {
    const book = makeBook('book-export', '潮汐之城')
    const rawNote = '第一行保留\n  第二行保留縮排\n第三行'
    const serialized = serializeReadingDataExport(
      [makeBookmark(book)],
      [makeNote(book, rawNote)],
    )

    expect(serialized).toContain('書名：潮汐之城')
    expect(serialized).toContain('章名：潮汐之城 第一章')
    expect(serialized).toContain('bookId：book-export')
    expect(serialized).toContain('chapterId：book-export-chapter-1')
    expect(serialized).toContain('paragraphIndex：7')
    expect(serialized).toContain('chapterProgress：0.625')
    expect(serialized).toContain(`筆記內容：\n${rawNote}\n—— 筆記結束 ——`)
    expect(serialized).not.toContain('不可匯出的故事簡介')
  })

  it('preserves note content exactly, including leading and trailing line breaks', () => {
    const rawNote = '\n  保留前導空白\r\n保留 CRLF\n最後一行\n'
    const serialized = serializeReadingDataExport(
      [],
      [makeNote(makeBook('book-note', '筆記測試'), rawNote)],
    )

    expect(serialized).toContain(`筆記內容：\n${rawNote}\n—— 筆記結束 ——`)
  })
})
