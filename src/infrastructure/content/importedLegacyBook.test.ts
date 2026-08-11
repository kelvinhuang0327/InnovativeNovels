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
const SECOND_IMPORTED_BOOK_ID = 'book-legacy-book-2'
const NEW_IMPORTED_BOOKS = [
  {
    id: 'book-legacy-book-3',
    title: '都市迷局',
    categoryLabel: '都市',
    firstChapterTitle: '第一章：告別的信封',
  },
  {
    id: 'book-legacy-book-6',
    title: '最後一班記憶列車',
    categoryLabel: '科幻',
    firstChapterTitle: '第一章：資料考古師',
  },
  {
    id: 'book-legacy-book-4',
    title: '同一個屋簷下',
    categoryLabel: '言情',
    firstChapterTitle: '第一章：陌生的鑰匙',
  },
  {
    id: 'book-legacy-book-5',
    title: '鏡海之城',
    categoryLabel: '奇幻',
    firstChapterTitle: '第一章：水面的另一側',
  },
] as const

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

    expect(books).toHaveLength(13)
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

  it('discovers the second imported book and opens its first chapter through the normal reading path', () => {
    const repository = new StaticContentRepository()
    const readingState = createReadingStateRepository()
    const books = listCatalog(repository)
    const matches = filterCatalog(books, {
      searchText: '開局流放，醫妃搬空國庫去逃荒',
    })
    const book = getBookDetail(repository, SECOND_IMPORTED_BOOK_ID)

    expect(matches.map((entry) => entry.book.id)).toEqual([
      SECOND_IMPORTED_BOOK_ID,
    ])
    expect(book?.book).toMatchObject({
      id: SECOND_IMPORTED_BOOK_ID,
      title: '開局流放，醫妃搬空國庫去逃荒',
      authorName: '蘇輕歌',
      categoryLabel: '古代言情',
    })
    expect(book?.chapters.map((chapter) => chapter.sequence)).toEqual([1, 2])
    expect(book?.chapters.map((chapter) => chapter.access)).toEqual([
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
    ])

    const destination = resolveStartOrContinue(
      repository,
      readingState,
      SECOND_IMPORTED_BOOK_ID,
    )

    expect(destination?.position).toMatchObject({
      bookId: SECOND_IMPORTED_BOOK_ID,
      chapterId: 'chapter-legacy-book-2-1',
    })

    if (!destination) {
      throw new Error('Second imported book did not resolve a readable start chapter')
    }

    const opened = openReadingChapter(repository, readingState, destination.position)

    expect(opened?.chapter.title).toBe('第1章 新婚夜')
    expect(opened?.prose).toEqual([
      '新婚的紅燭還未燃盡，宮牆之外的風聲便已裹著流放的消息撲面而來。',
      '她沒有哭，也沒有問命運為何如此，只是轉身打開藥箱，開始清點能帶走的一切。',
    ])
  })

  it.each(NEW_IMPORTED_BOOKS)(
    'discovers $id through Catalog and opens its readable final act',
    ({ id, title, categoryLabel, firstChapterTitle }) => {
      const repository = new StaticContentRepository()
      const readingState = createReadingStateRepository()
      const books = listCatalog(repository)
      const matches = filterCatalog(books, { searchText: title })
      const book = getBookDetail(repository, id)

      expect(matches.map((entry) => entry.book.id)).toEqual([id])
      expect(book?.book).toMatchObject({ id, title, categoryLabel })
      expect(book?.chapters).toHaveLength(13)
      expect(book?.chapters.map((chapter) => chapter.sequence)).toEqual(
        Array.from({ length: 13 }, (_, index) => index + 1),
      )
      expect(book?.chapters.slice(0, 10).every((chapter) => chapter.access === CHAPTER_ACCESS.READABLE)).toBe(true)
      expect(book?.chapters.slice(10).every((chapter) => chapter.access === CHAPTER_ACCESS.READABLE)).toBe(true)

      const destination = resolveStartOrContinue(repository, readingState, id)

      expect(destination?.position).toMatchObject({
        bookId: id,
        chapterId: `chapter-legacy-${id.replace('book-legacy-', '')}-1`,
      })

      if (!destination) {
        throw new Error(`Imported book ${id} did not resolve a readable start chapter`)
      }

      const opened = openReadingChapter(repository, readingState, destination.position)

      expect(opened?.chapter.title).toBe(firstChapterTitle)
      expect(opened?.prose.length).toBeGreaterThan(0)
      expect(
        repository.getChapterProse(
          `chapter-legacy-${id.replace('book-legacy-', '')}-11`,
        )?.length,
      ).toBeGreaterThan(0)
    },
  )
})
