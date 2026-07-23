import type {
  ContentBook,
  ContentRepository,
} from '../../application/catalog/contentRepository'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'

const demoBookId = bookId('book-tide-city')

const chapters: readonly Chapter[] = [
  {
    id: chapterId('chapter-sealed-gate'),
    bookId: demoBookId,
    title: '第三章：封印之門',
    sequence: chapterSequence(3),
    access: CHAPTER_ACCESS.LOCKED,
  },
  {
    id: chapterId('chapter-tide-letter'),
    bookId: demoBookId,
    title: '第一章：潮聲來信',
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-lighthouse-watch'),
    bookId: demoBookId,
    title: '第二章：燈塔守望',
    sequence: chapterSequence(2),
    access: CHAPTER_ACCESS.READABLE,
  },
]

const demoBook: ContentBook = {
  book: {
    id: demoBookId,
    title: '潮汐之城',
    authorName: '林澄',
    categoryLabel: '奇幻',
  },
  description: '當海潮開始傳遞記憶，一名守燈人必須決定哪些故事值得留下。',
  chapters,
}

const accessibleProse = new Map<string, readonly string[]>([
  [
    'chapter-tide-letter',
    [
      '清晨的第一道潮聲穿過港口時，澄夏在門縫下發現一封帶著鹽晶的信。',
      '信上沒有署名，只有一行像浪痕般彎曲的字：今晚，請替城市記住燈火。',
    ],
  ],
  [
    'chapter-lighthouse-watch',
    [
      '入夜後，舊燈塔的銅門比記憶裡更沉，門軸發出低低的嘆息。',
      '澄夏登上頂層，看見遠海有三道不屬於船隻的光，正依序回答她手中的信。',
    ],
  ],
])

export class StaticContentRepository implements ContentRepository {
  listBooks(): readonly ContentBook[] {
    return [demoBook]
  }

  getBook(requestedBookId: string): ContentBook | undefined {
    return requestedBookId === demoBook.book.id ? demoBook : undefined
  }

  getChapterProse(requestedChapterId: string): readonly string[] | undefined {
    return accessibleProse.get(requestedChapterId)
  }
}
