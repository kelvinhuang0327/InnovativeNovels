import type {
  ContentBook,
  ContentRepository,
} from '../../application/catalog/contentRepository'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence, type Chapter } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'

const tideCityId = bookId('book-tide-city')

const tideCityChapters: readonly Chapter[] = [
  {
    id: chapterId('chapter-sealed-gate'),
    bookId: tideCityId,
    title: '第三章：封印之門',
    sequence: chapterSequence(3),
    access: CHAPTER_ACCESS.LOCKED,
  },
  {
    id: chapterId('chapter-tide-letter'),
    bookId: tideCityId,
    title: '第一章：潮聲來信',
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-lighthouse-watch'),
    bookId: tideCityId,
    title: '第二章：燈塔守望',
    sequence: chapterSequence(2),
    access: CHAPTER_ACCESS.READABLE,
  },
]

const tideCityBook: ContentBook = {
  book: {
    id: tideCityId,
    title: '潮汐之城',
    authorName: '林澄',
    categoryLabel: '懸疑',
  },
  description: '當海潮開始傳遞記憶，一名守燈人必須決定哪些故事值得留下。',
  chapters: tideCityChapters,
}

const frostImmortalId = bookId('book-frost-immortal')

const frostImmortalChapters: readonly Chapter[] = [
  {
    id: chapterId('chapter-picking-up-the-sword'),
    bookId: frostImmortalId,
    title: '第一章：拾劍',
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-mountain-gate'),
    bookId: frostImmortalId,
    title: '第二章：入山門',
    sequence: chapterSequence(2),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-immortal-tribulation'),
    bookId: frostImmortalId,
    title: '第三章：仙途劫',
    sequence: chapterSequence(3),
    access: CHAPTER_ACCESS.LOCKED,
  },
]

const frostImmortalBook: ContentBook = {
  book: {
    id: frostImmortalId,
    title: '霜劍仙途',
    authorName: '沈墨白',
    categoryLabel: '仙俠',
  },
  description:
    '一介凡人劍徒偶得殘缺仙訣，卻發現修仙之路布滿比妖魔更難纏的人心。',
  chapters: frostImmortalChapters,
}

const midnightOfficeId = bookId('book-midnight-office')

const midnightOfficeChapters: readonly Chapter[] = [
  {
    id: chapterId('chapter-reason-for-overtime'),
    bookId: midnightOfficeId,
    title: '第一章：加班的理由',
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-elevator-silence'),
    bookId: midnightOfficeId,
    title: '第二章：電梯裡的沉默',
    sequence: chapterSequence(2),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-break-room-truth'),
    bookId: midnightOfficeId,
    title: '第三章：茶水間的真相',
    sequence: chapterSequence(3),
    access: CHAPTER_ACCESS.LOCKED,
  },
]

const midnightOfficeBook: ContentBook = {
  book: {
    id: midnightOfficeId,
    title: '午夜寫字樓',
    authorName: '韓亦晴',
    categoryLabel: '都市',
  },
  description:
    '一場深夜加班意外，讓平凡上班族捲入公司高層的職場角力與都市人情冷暖。',
  chapters: midnightOfficeChapters,
}

const plumRainLetterId = bookId('book-plum-rain-letter')

const plumRainLetterChapters: readonly Chapter[] = [
  {
    id: chapterId('chapter-decade-late-letter'),
    bookId: plumRainLetterId,
    title: '第一章：遲到十年的信',
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-rainy-day-umbrella'),
    bookId: plumRainLetterId,
    title: '第二章：雨天的傘',
    sequence: chapterSequence(2),
    access: CHAPTER_ACCESS.READABLE,
  },
  {
    id: chapterId('chapter-after-reunion'),
    bookId: plumRainLetterId,
    title: '第三章：重逢之後',
    sequence: chapterSequence(3),
    access: CHAPTER_ACCESS.LOCKED,
  },
]

const plumRainLetterBook: ContentBook = {
  book: {
    id: plumRainLetterId,
    title: '梅雨與信',
    authorName: '蘇晚',
    categoryLabel: '言情',
  },
  description:
    '在一座總是下雨的小鎮，她收到一封本該十年前寄達的信，也重新遇見那個寫信的人。',
  chapters: plumRainLetterChapters,
}

const books: readonly ContentBook[] = [
  tideCityBook,
  frostImmortalBook,
  midnightOfficeBook,
  plumRainLetterBook,
]

const booksById = new Map(books.map((entry) => [entry.book.id as string, entry]))

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
  [
    'chapter-picking-up-the-sword',
    [
      '沈知拾起斷劍時，劍身還殘留著一絲極淡的靈氣，像是誰在很久以前，把一句沒說完的話封進了鐵裡。',
      '村口的老獵戶說，那是三十年前墜落山谷的仙人所遺，撿到它的人，要嘛飛升，要嘛連骨頭都找不回來。',
    ],
  ],
  [
    'chapter-mountain-gate',
    [
      '青雲山門的石階有九百九十九級，沈知數到第五百階時，才明白山門考較的從來不是腳力。',
      '守門的老修士只問了他一句話：「劍是你的，還是你是劍的？」他答不出來，山門卻在此時緩緩開啟。',
    ],
  ],
  [
    'chapter-reason-for-overtime',
    [
      '林知遠盯著電腦螢幕上第十七次被打回的簡報，時鐘指向十一點四十分，茶水間的燈還亮著。',
      '他知道自己不是唯一被留下來的人，只是不知道，這一整層樓的燈火通明，其實都是同一場局的一部分。',
    ],
  ],
  [
    'chapter-elevator-silence',
    [
      '電梯門關上的瞬間，總監按下的樓層不是地下停車場，而是一個林知遠從未見過的數字。',
      '四十秒的下降，沒有人說話，鏡面反射出所有人臉上同樣不自然的平靜。',
    ],
  ],
  [
    'chapter-decade-late-letter',
    [
      '郵差把信放進信箱時，特別叮囑了一句：「地址是舊的，但郵戳是新的，妳自己看看。」',
      '蘇晚拆開信封，認出那是十年前，她以為早已隨對方一起消失在雨裡的字跡。',
    ],
  ],
  [
    'chapter-rainy-day-umbrella',
    [
      '小鎮的雨從不整點下，卻總在她走到轉角書店前，準時落下第一滴。',
      '傘是舊的，撐傘的人也是舊識，只是這一次，他沒有像十年前那樣，把傘留給她一個人走。',
    ],
  ],
])

export class StaticContentRepository implements ContentRepository {
  listBooks(): readonly ContentBook[] {
    return books
  }

  getBook(requestedBookId: string): ContentBook | undefined {
    return booksById.get(requestedBookId)
  }

  getChapterProse(requestedChapterId: string): readonly string[] | undefined {
    return accessibleProse.get(requestedChapterId)
  }
}
