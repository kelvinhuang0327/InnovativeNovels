import { describe, expect, it } from 'vitest'
import {
  getBookDetail,
  listCatalog,
  filterCatalog,
} from '../../application/catalog/catalogUseCases'
import {
  openReadingChapter,
  resolveStartOrContinue,
} from '../../application/reading/readingUseCases'
import type { ReadingStateRepository } from '../../application/reading/readingStateRepository'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { StaticContentRepository } from './staticContentRepository'

const IMPORTED_BOOK_ID = 'book-legacy-book-1'

function createReadingStateRepository(): ReadingStateRepository {
  let savedPosition: ReadingPosition | undefined

  return {
    load: () => savedPosition,
    save: (position) => {
      savedPosition = position
    },
    listSavedPositions: () => (savedPosition ? [savedPosition] : []),
  }
}

describe('imported legacy book application path', () => {
  it('is discoverable in Catalog and exposes its ordered Book Detail chapters', () => {
    const repository = new StaticContentRepository()
    const books = listCatalog(repository)
    const matches = filterCatalog(books, { searchText: '吞噬古帝' })
    const book = getBookDetail(repository, IMPORTED_BOOK_ID)

    expect(books).toHaveLength(7)
    expect(matches.map((entry) => entry.book.id)).toEqual([IMPORTED_BOOK_ID])
    expect(book?.book).toMatchObject({
      id: IMPORTED_BOOK_ID,
      title: '吞噬古帝',
      authorName: '黑白仙鶴',
      categoryLabel: '玄幻奇幻',
    })
    expect(book?.chapters.map((chapter) => chapter.id)).toEqual([
      'chapter-legacy-book-1-1',
      'chapter-legacy-book-1-2',
      'chapter-legacy-book-1-3',
      'chapter-legacy-book-1-4',
    ])
    expect(book?.chapters.every((chapter) => chapter.access === CHAPTER_ACCESS.READABLE)).toBe(true)
  })

  it('opens the first existing chapter through the normal reading path', () => {
    const repository = new StaticContentRepository()
    const readingState = createReadingStateRepository()
    const destination = resolveStartOrContinue(
      repository,
      readingState,
      IMPORTED_BOOK_ID,
    )

    expect(destination).toMatchObject({
      position: {
        bookId: IMPORTED_BOOK_ID,
        chapterId: 'chapter-legacy-book-1-1',
      },
      isContinuing: false,
    })

    if (!destination) {
      throw new Error('Imported book did not resolve a readable start chapter')
    }

    const opened = openReadingChapter(repository, readingState, destination.position)

    expect(opened?.chapter.title).toBe('第1章 覺醒混沌體，獲混沌吞噬塔')
    expect(opened?.prose).toHaveLength(6)
    expect(opened?.prose[0]).toBe(
      '“父親，蘇昊已經派人傳來消息，必須將蘇辰逐出家族，否則的話，蘇族會執行家法，清理門戶。”',
    )
  })
})
