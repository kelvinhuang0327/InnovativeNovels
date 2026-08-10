import { describe, expect, it } from 'vitest'
import { openReadingChapter } from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { StaticContentRepository } from './staticContentRepository'
import emberCrownFixture from './books/book-ember-crown.json'
import orbitLastLightFixture from './books/book-orbit-last-light.json'
import tideArchiveFixture from './books/book-tide-archive.json'

const EXPECTED_CATALOG_ORDER = [
  'book-tide-city',
  'book-frost-immortal',
  'book-midnight-office',
  'book-plum-rain-letter',
  'book-ember-crown',
  'book-orbit-last-light',
  'book-legacy-book-1',
  'book-legacy-book-2',
  'book-legacy-book-3',
  'book-legacy-book-6',
  'book-legacy-book-4',
  'book-legacy-book-5',
  'book-tide-archive',
] as const

const EXPECTED_BOOK_METADATA: Record<
  string,
  { title: string; authorName: string; categoryLabel: string }
> = {
  'book-tide-city': {
    title: '潮汐之城',
    authorName: '林澄',
    categoryLabel: '懸疑',
  },
  'book-frost-immortal': {
    title: '霜劍仙途',
    authorName: '沈墨白',
    categoryLabel: '仙俠',
  },
  'book-midnight-office': {
    title: '午夜寫字樓',
    authorName: '韓亦晴',
    categoryLabel: '都市',
  },
  'book-plum-rain-letter': {
    title: '梅雨與信',
    authorName: '蘇晚',
    categoryLabel: '言情',
  },
  'book-ember-crown': {
    title: '餘燼王冠',
    authorName: '葉岑',
    categoryLabel: '奇幻',
  },
  'book-orbit-last-light': {
    title: '軌道盡頭的微光',
    authorName: '岑海',
    categoryLabel: '科幻',
  },
  'book-legacy-book-1': {
    title: '吞噬古帝',
    authorName: '黑白仙鶴',
    categoryLabel: '玄幻奇幻',
  },
  'book-legacy-book-2': {
    title: '開局流放，醫妃搬空國庫去逃荒',
    authorName: '蘇輕歌',
    categoryLabel: '古代言情',
  },
  'book-legacy-book-3': {
    title: '都市迷局',
    authorName: 'NovelCraft AI',
    categoryLabel: '都市',
  },
  'book-legacy-book-6': {
    title: '最後一班記憶列車',
    authorName: 'NovelCraft AI',
    categoryLabel: '科幻',
  },
  'book-legacy-book-4': {
    title: '同一個屋簷下',
    authorName: 'NovelCraft AI',
    categoryLabel: '言情',
  },
  'book-legacy-book-5': {
    title: '鏡海之城',
    authorName: 'NovelCraft AI',
    categoryLabel: '奇幻',
  },
  'book-tide-archive': {
    title: '潮汐檔案',
    authorName: 'InnovativeNovels AI',
    categoryLabel: '科幻懸疑',
  },
}

const EXPECTED_AUTHORED_CHAPTER_ORDER: Record<string, readonly string[]> = {
  'book-tide-city': [
    'chapter-sealed-gate',
    'chapter-tide-letter',
    'chapter-lighthouse-watch',
  ],
  'book-frost-immortal': [
    'chapter-picking-up-the-sword',
    'chapter-mountain-gate',
    'chapter-immortal-tribulation',
  ],
  'book-midnight-office': [
    'chapter-reason-for-overtime',
    'chapter-elevator-silence',
    'chapter-break-room-truth',
  ],
  'book-plum-rain-letter': [
    'chapter-decade-late-letter',
    'chapter-rainy-day-umbrella',
    'chapter-after-reunion',
  ],
  'book-ember-crown': [
    'chapter-ember-city-of-dusk',
    'chapter-ember-the-old-crown',
    'chapter-ember-dawns-shadow',
    'chapter-ember-the-cold-hour',
    'chapter-ember-crown-relit',
  ],
  'book-orbit-last-light': [
    'chapter-orbit-final-shift',
    'chapter-orbit-echo-signal',
    'chapter-orbit-fracture-line',
    'chapter-orbit-last-brace',
    'chapter-orbit-safe-passage',
  ],
  'book-legacy-book-1': [
    'chapter-legacy-book-1-1',
    'chapter-legacy-book-1-2',
    'chapter-legacy-book-1-3',
    'chapter-legacy-book-1-4',
  ],
  'book-legacy-book-2': [
    'chapter-legacy-book-2-1',
    'chapter-legacy-book-2-2',
  ],
  'book-legacy-book-3': Array.from(
    { length: 13 },
    (_, index) => `chapter-legacy-book-3-${index + 1}`,
  ),
  'book-legacy-book-6': Array.from(
    { length: 13 },
    (_, index) => `chapter-legacy-book-6-${index + 1}`,
  ),
  'book-legacy-book-4': Array.from(
    { length: 13 },
    (_, index) => `chapter-legacy-book-4-${index + 1}`,
  ),
  'book-legacy-book-5': Array.from(
    { length: 13 },
    (_, index) => `chapter-legacy-book-5-${index + 1}`,
  ),
  'book-tide-archive': [
    'chapter-tide-archive-001',
    'chapter-tide-archive-002',
    'chapter-tide-archive-003',
  ],
}

const EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS: Record<
  string,
  { sequence: number; access: string }
> = {
  'chapter-sealed-gate': { sequence: 3, access: CHAPTER_ACCESS.LOCKED },
  'chapter-tide-letter': { sequence: 1, access: CHAPTER_ACCESS.READABLE },
  'chapter-lighthouse-watch': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-picking-up-the-sword': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-mountain-gate': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-immortal-tribulation': {
    sequence: 3,
    access: CHAPTER_ACCESS.LOCKED,
  },
  'chapter-reason-for-overtime': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-elevator-silence': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-break-room-truth': { sequence: 3, access: CHAPTER_ACCESS.LOCKED },
  'chapter-decade-late-letter': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-rainy-day-umbrella': {
    sequence: 2,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-after-reunion': { sequence: 3, access: CHAPTER_ACCESS.LOCKED },
  'chapter-ember-city-of-dusk': { sequence: 1, access: CHAPTER_ACCESS.READABLE },
  'chapter-ember-the-old-crown': {
    sequence: 2,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-ember-dawns-shadow': {
    sequence: 3,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-ember-the-cold-hour': {
    sequence: 4,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-ember-crown-relit': { sequence: 5, access: CHAPTER_ACCESS.READABLE },
  'chapter-orbit-final-shift': { sequence: 1, access: CHAPTER_ACCESS.READABLE },
  'chapter-orbit-echo-signal': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-orbit-fracture-line': {
    sequence: 3,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-orbit-last-brace': { sequence: 4, access: CHAPTER_ACCESS.READABLE },
  'chapter-orbit-safe-passage': {
    sequence: 5,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-legacy-book-2-1': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-legacy-book-2-2': {
    sequence: 2,
    access: CHAPTER_ACCESS.READABLE,
  },
}

for (const bookId of ['book-legacy-book-3', 'book-legacy-book-6', 'book-legacy-book-4', 'book-legacy-book-5']) {
  const legacyBookId = bookId.replace('book-legacy-', '')

  for (let sequence = 1; sequence <= 13; sequence += 1) {
    EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS[`chapter-legacy-${legacyBookId}-${sequence}`] = {
      sequence,
      access: sequence <= 10 ? CHAPTER_ACCESS.READABLE : CHAPTER_ACCESS.LOCKED,
    }
  }
}

const EXPECTED_ACCESSIBLE_PROSE: Record<string, readonly string[]> = {
  'chapter-tide-letter': [
    '清晨的第一道潮聲穿過港口時，澄夏在門縫下發現一封帶著鹽晶的信。',
    '信上沒有署名，只有一行像浪痕般彎曲的字：今晚，請替城市記住燈火。',
  ],
  'chapter-lighthouse-watch': [
    '入夜後，舊燈塔的銅門比記憶裡更沉，門軸發出低低的嘆息。',
    '澄夏登上頂層，看見遠海有三道不屬於船隻的光，正依序回答她手中的信。',
  ],
  'chapter-picking-up-the-sword': [
    '沈知拾起斷劍時，劍身還殘留著一絲極淡的靈氣，像是誰在很久以前，把一句沒說完的話封進了鐵裡。',
    '村口的老獵戶說，那是三十年前墜落山谷的仙人所遺，撿到它的人，要嘛飛升，要嘛連骨頭都找不回來。',
  ],
  'chapter-mountain-gate': [
    '青雲山門的石階有九百九十九級，沈知數到第五百階時，才明白山門考較的從來不是腳力。',
    '守門的老修士只問了他一句話：「劍是你的，還是你是劍的？」他答不出來，山門卻在此時緩緩開啟。',
  ],
  'chapter-reason-for-overtime': [
    '林知遠盯著電腦螢幕上第十七次被打回的簡報，時鐘指向十一點四十分，茶水間的燈還亮著。',
    '他知道自己不是唯一被留下來的人，只是不知道，這一整層樓的燈火通明，其實都是同一場局的一部分。',
  ],
  'chapter-elevator-silence': [
    '電梯門關上的瞬間，總監按下的樓層不是地下停車場，而是一個林知遠從未見過的數字。',
    '四十秒的下降，沒有人說話，鏡面反射出所有人臉上同樣不自然的平靜。',
  ],
  'chapter-decade-late-letter': [
    '郵差把信放進信箱時，特別叮囑了一句：「地址是舊的，但郵戳是新的，妳自己看看。」',
    '蘇晚拆開信封，認出那是十年前，她以為早已隨對方一起消失在雨裡的字跡。',
  ],
  'chapter-rainy-day-umbrella': [
    '小鎮的雨從不整點下，卻總在她走到轉角書店前，準時落下第一滴。',
    '傘是舊的，撐傘的人也是舊識，只是這一次，他沒有像十年前那樣，把傘留給她一個人走。',
  ],
  'chapter-legacy-book-2-1': [
    '新婚的紅燭還未燃盡，宮牆之外的風聲便已裹著流放的消息撲面而來。',
    '她沒有哭，也沒有問命運為何如此，只是轉身打開藥箱，開始清點能帶走的一切。',
  ],
  'chapter-legacy-book-2-2': [
    '當最後一紙文書落地，親緣也像門外的雪一樣，乾脆地斷了個乾淨。',
  ],
}

for (const fixtureChapter of tideArchiveFixture.chapters) {
  EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS[fixtureChapter.chapterId] = {
    sequence: fixtureChapter.sequence,
    access: fixtureChapter.access,
  }
  EXPECTED_ACCESSIBLE_PROSE[fixtureChapter.chapterId] = fixtureChapter.prose
}

const LOCKED_CHAPTER_IDS = [
  'chapter-sealed-gate',
  'chapter-immortal-tribulation',
  'chapter-break-room-truth',
  'chapter-after-reunion',
  ...Array.from({ length: 3 }, (_, index) => `chapter-legacy-book-3-${index + 11}`),
  ...Array.from({ length: 3 }, (_, index) => `chapter-legacy-book-6-${index + 11}`),
  ...Array.from({ length: 3 }, (_, index) => `chapter-legacy-book-4-${index + 11}`),
  ...Array.from({ length: 3 }, (_, index) => `chapter-legacy-book-5-${index + 11}`),
] as const

describe('StaticContentRepository parity', () => {
  it('lists exactly the thirteen books in the expected catalog order', () => {
    const repository = new StaticContentRepository()
    const books = repository.listBooks()

    expect(books.map((entry) => entry.book.id)).toEqual(EXPECTED_CATALOG_ORDER)
    expect(books).toHaveLength(13)
  })

  it('represents all target genres in the catalog', () => {
    const repository = new StaticContentRepository()
    const genres = repository.listBooks().map((entry) => entry.book.categoryLabel)

    expect(new Set(genres)).toEqual(
      new Set([
        '懸疑',
        '仙俠',
        '都市',
        '言情',
        '奇幻',
        '科幻',
        '玄幻奇幻',
        '古代言情',
        '科幻懸疑',
      ]),
    )
  })

  it('preserves exact book metadata for every book', () => {
    const repository = new StaticContentRepository()

    for (const [id, expected] of Object.entries(EXPECTED_BOOK_METADATA)) {
      const entry = repository.getBook(id)

      expect(entry, id).toBeDefined()
      expect(entry?.book.title).toBe(expected.title)
      expect(entry?.book.authorName).toBe(expected.authorName)
      expect(entry?.book.categoryLabel).toBe(expected.categoryLabel)
    }
  })

  it('preserves the fixture-authored chapter array order for every book, unsorted', () => {
    const repository = new StaticContentRepository()

    for (const [bookId, expectedOrder] of Object.entries(
      EXPECTED_AUTHORED_CHAPTER_ORDER,
    )) {
      const entry = repository.getBook(bookId)

      expect(entry?.chapters.map((chapter) => chapter.id)).toEqual(
        expectedOrder,
      )
    }
  })

  it('retains book-tide-city in authored sequence order 3,1,2', () => {
    const repository = new StaticContentRepository()
    const entry = repository.getBook('book-tide-city')

    expect(entry?.chapters.map((chapter) => chapter.sequence)).toEqual([
      3, 1, 2,
    ])
  })

  it('preserves exact chapter sequence and access for every chapter', () => {
    const repository = new StaticContentRepository()
    const allChapters = repository
      .listBooks()
      .flatMap((entry) => entry.chapters)

    for (const [chapterId, expected] of Object.entries(
      EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS,
    )) {
      const chapter = allChapters.find((candidate) => candidate.id === chapterId)

      expect(chapter, chapterId).toBeDefined()
      expect(chapter?.sequence).toBe(expected.sequence)
      expect(chapter?.access).toBe(expected.access)
    }
  })

  it('has exactly sixteen LOCKED chapters and no UNAVAILABLE chapters', () => {
    const repository = new StaticContentRepository()
    const allChapters = repository
      .listBooks()
      .flatMap((entry) => entry.chapters)

    const locked = allChapters.filter(
      (chapter) => chapter.access === CHAPTER_ACCESS.LOCKED,
    )
    const unavailable = allChapters.filter(
      (chapter) => chapter.access === CHAPTER_ACCESS.UNAVAILABLE,
    )

    expect(locked.map((chapter) => chapter.id).sort()).toEqual(
      [...LOCKED_CHAPTER_IDS].sort(),
    )
    expect(locked).toHaveLength(16)
    expect(unavailable).toHaveLength(0)
  })

  it('returns exact two-paragraph prose for every accessible chapter', () => {
    const repository = new StaticContentRepository()

    for (const [chapterId, expectedProse] of Object.entries(
      EXPECTED_ACCESSIBLE_PROSE,
    )) {
      expect(repository.getChapterProse(chapterId)).toEqual(expectedProse)
    }

    expect(Object.keys(EXPECTED_ACCESSIBLE_PROSE)).toHaveLength(13)
  })

  it('lets the reader open the full published first chapter', () => {
    const repository = new StaticContentRepository()
    const opened = openReadingChapter(
      repository,
      {
        load: () => undefined,
        save: () => undefined,
        listSavedPositions: () => [],
      },
      {
        bookId: bookId('book-tide-archive'),
        chapterId: chapterId('chapter-tide-archive-001'),
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    )

    expect(opened?.prose).toEqual(tideArchiveFixture.chapters[0].prose)
  })

  it('returns undefined prose for every LOCKED chapter', () => {
    const repository = new StaticContentRepository()

    for (const chapterId of LOCKED_CHAPTER_IDS) {
      expect(repository.getChapterProse(chapterId)).toBeUndefined()
    }
  })

  it('returns undefined for an unknown book id', () => {
    const repository = new StaticContentRepository()

    expect(repository.getBook('book-does-not-exist')).toBeUndefined()
  })

  it.each([
    ['book-ember-crown', emberCrownFixture],
    ['book-orbit-last-light', orbitLastLightFixture],
  ])(
    '%s has exactly five READABLE chapters with non-empty fixture-matching prose',
    (bookId, fixture) => {
      const repository = new StaticContentRepository()
      const entry = repository.getBook(bookId)

      expect(entry?.chapters).toHaveLength(5)
      expect(entry?.chapters.every((chapter) => chapter.access === CHAPTER_ACCESS.READABLE)).toBe(true)

      for (const fixtureChapter of fixture.chapters) {
        const prose = repository.getChapterProse(fixtureChapter.chapterId)

        expect(prose, fixtureChapter.chapterId).toEqual(fixtureChapter.prose)
        expect(prose?.length).toBeGreaterThan(0)
      }
    },
  )
})
