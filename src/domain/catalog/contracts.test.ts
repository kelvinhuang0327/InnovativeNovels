import { describe, expect, it } from 'vitest'
import type { Book } from './book'
import type { Chapter } from './chapter'
import { chapterSequence } from './chapter'
import { bookId, chapterId } from './identifiers'

describe('catalog identity contracts', () => {
  it('keeps book identity explicit when titles match', () => {
    const first: Book = {
      id: bookId('book-alpha'),
      title: 'Shared title',
      authorName: 'Author',
      categoryLabel: 'Fiction',
    }
    const second: Book = { ...first, id: bookId('book-beta') }

    expect(first.id).not.toBe(second.id)
    expect(first.title).toBe(second.title)
  })

  it('keeps chapter identity and order explicit', () => {
    const chapter: Chapter = {
      id: chapterId('chapter-stable-id'),
      bookId: bookId('book-alpha'),
      title: 'Opening',
      sequence: chapterSequence(1),
      access: 'PREVIEW',
    }

    expect(chapter).toMatchObject({
      id: 'chapter-stable-id',
      bookId: 'book-alpha',
      sequence: 1,
    })
  })

  it('rejects invalid explicit identifiers and sequence values', () => {
    expect(() => bookId('   ')).toThrow(TypeError)
    expect(() => chapterId('')).toThrow(TypeError)
    expect(() => chapterSequence(0)).toThrow(TypeError)
  })
})
