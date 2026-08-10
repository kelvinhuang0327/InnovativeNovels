import { CHAPTER_ACCESS } from '../access/chapterAccess'
import { describe, expect, it } from 'vitest'
import type { PublishedBookSnapshot } from './publishedAppendCandidate'
import { buildPublishedBookContinuationDraft } from './publishedBookContinuation'

function snapshot(
  chapters: PublishedBookSnapshot['chapters'],
): PublishedBookSnapshot {
  return {
    schema: 'innovative-novels/content-book/v1',
    bookId: 'book-tide-archive',
    catalogSequence: 13,
    title: '潮汐檔案',
    authorName: 'InnovativeNovels AI',
    categoryLabel: '科幻懸疑',
    description: '一段完整的 production 故事。',
    chapters,
  }
}

describe('published book continuation mapping', () => {
  it('preserves chapter sequence, title, prose, and ordering exactly', () => {
    const result = buildPublishedBookContinuationDraft(
      snapshot([
        {
          chapterId: 'chapter-tide-archive-001',
          sequence: 1,
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
          prose: ['保留前後空白  ', '第二段。'],
        },
        {
          chapterId: 'chapter-tide-archive-002',
          sequence: 2,
          title: '第二章',
          access: CHAPTER_ACCESS.PREVIEW,
          prose: ['第三段。'],
        },
      ]),
    )

    expect(result).toEqual({
      ok: true,
      draft: expect.objectContaining({
        title: '潮汐檔案',
        categoryLabel: '科幻懸疑',
        status: 'DRAFT',
        chapters: [
          { sequence: 1, title: '第一章', prose: ['保留前後空白  ', '第二段。'] },
          { sequence: 2, title: '第二章', prose: ['第三段。'] },
        ],
      }),
    })
  })

  it('rejects a published chapter whose prose is unavailable', () => {
    const result = buildPublishedBookContinuationDraft(
      snapshot([
        {
          chapterId: 'chapter-tide-archive-001',
          sequence: 1,
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
        },
      ]),
    )

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({
        code: 'PUBLISHED_BOOK_NOT_FULLY_AVAILABLE_FOR_CONTINUATION',
      }),
    })
  })

  it('rejects malformed chapter sequences without synthesizing content', () => {
    const result = buildPublishedBookContinuationDraft(
      snapshot([
        {
          chapterId: 'chapter-tide-archive-001',
          sequence: 2,
          title: '第一章',
          access: CHAPTER_ACCESS.READABLE,
          prose: ['第一段。'],
        },
      ]),
    )

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ code: 'PUBLISHED_BOOK_MALFORMED' }),
    })
  })
})
