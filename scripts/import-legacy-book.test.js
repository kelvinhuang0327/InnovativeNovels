import { describe, expect, it } from 'vitest'
import { convertLegacyBook } from './import-legacy-book.mjs'

describe('convertLegacyBook', () => {
  it('maps legacy metadata and preserves accessible prose deterministically', () => {
    const legacyBook = {
      id: 'book-1',
      title: '吞噬古帝',
      authorName: '黑白仙鶴',
      categoryLabel: '玄幻奇幻',
      description: '既有描述',
      chapters: [
        {
          id: 'b1-c1',
          title: '第1章',
          accessState: 'cached',
          paragraphs: ['第一段', '第二段'],
        },
        {
          id: 'b1-c2',
          title: '第2章',
          accessState: 'free',
          paragraphs: ['第三段'],
        },
      ],
    }

    const first = convertLegacyBook(legacyBook, { catalogSequence: 7 })
    const second = convertLegacyBook(legacyBook, { catalogSequence: 7 })

    expect(first).toEqual(second)
    expect(first).toEqual({
      schema: 'innovative-novels/content-book/v1',
      bookId: 'book-legacy-book-1',
      catalogSequence: 7,
      title: '吞噬古帝',
      authorName: '黑白仙鶴',
      categoryLabel: '玄幻奇幻',
      description: '既有描述',
      chapters: [
        {
          chapterId: 'chapter-legacy-book-1-1',
          sequence: 1,
          title: '第1章',
          access: 'READABLE',
          prose: ['第一段', '第二段'],
        },
        {
          chapterId: 'chapter-legacy-book-1-2',
          sequence: 2,
          title: '第2章',
          access: 'READABLE',
          prose: ['第三段'],
        },
      ],
    })
  })

  it('omits protected prose for locked and unavailable chapters', () => {
    const fixture = convertLegacyBook(
      {
        id: 'book-protected',
        title: '受保護內容',
        authorName: '既有作者',
        categoryLabel: '測試',
        description: '既有描述',
        chapters: [
          {
            id: 'locked',
            title: '鎖定章節',
            accessState: 'locked',
            paragraphs: ['不得輸出的內容'],
          },
          {
            id: 'unavailable',
            title: '不可用章節',
            accessState: 'unavailable',
            paragraphs: ['不得輸出的內容'],
          },
        ],
      },
      { catalogSequence: 8 },
    )

    expect(fixture.chapters).toEqual([
      {
        chapterId: 'chapter-legacy-book-protected-1',
        sequence: 1,
        title: '鎖定章節',
        access: 'LOCKED',
      },
      {
        chapterId: 'chapter-legacy-book-protected-2',
        sequence: 2,
        title: '不可用章節',
        access: 'UNAVAILABLE',
      },
    ])
  })
})
