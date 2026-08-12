import { describe, expect, it } from 'vitest'
import {
  navigateToAdjacentChapter,
  openReadingChapter,
} from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { StaticContentRepository } from './staticContentRepository'
import emberCrownFixture from './books/book-ember-crown.json'
import frostImmortalFixture from './books/book-frost-immortal.json'
import midnightOfficeFixture from './books/book-midnight-office.json'
import orbitLastLightFixture from './books/book-orbit-last-light.json'
import plumRainLetterFixture from './books/book-plum-rain-letter.json'
import tideCityFixture from './books/book-tide-city.json'
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
    title: '燈骨問天',
    authorName: '聞人照',
    categoryLabel: '玄幻奇幻',
  },
  'book-legacy-book-2': {
    title: '河燈未央',
    authorName: '晏棠',
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
    'chapter-tide-city-004',
    'chapter-tide-city-005',
    'chapter-tide-city-006',
    'chapter-tide-city-007',
    'chapter-tide-city-008',
  ],
  'book-frost-immortal': [
    'chapter-picking-up-the-sword',
    'chapter-mountain-gate',
    'chapter-immortal-tribulation',
    'chapter-frost-immortal-004',
    'chapter-frost-immortal-005',
    'chapter-frost-immortal-006',
    'chapter-frost-immortal-007',
    'chapter-frost-immortal-008',
  ],
  'book-midnight-office': [
    'chapter-reason-for-overtime',
    'chapter-elevator-silence',
    'chapter-break-room-truth',
    'chapter-midnight-office-004',
    'chapter-midnight-office-005',
    'chapter-midnight-office-006',
    'chapter-midnight-office-007',
    'chapter-midnight-office-008',
  ],
  'book-plum-rain-letter': [
    'chapter-decade-late-letter',
    'chapter-rainy-day-umbrella',
    'chapter-after-reunion',
    'chapter-plum-rain-letter-004',
    'chapter-plum-rain-letter-005',
    'chapter-plum-rain-letter-006',
    'chapter-plum-rain-letter-007',
    'chapter-plum-rain-letter-008',
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
    'chapter-legacy-book-1-5',
    'chapter-legacy-book-1-6',
    'chapter-legacy-book-1-7',
    'chapter-legacy-book-1-8',
  ],
  'book-legacy-book-2': [
    'chapter-legacy-book-2-1',
    'chapter-legacy-book-2-2',
    'chapter-legacy-book-2-3',
    'chapter-legacy-book-2-4',
    'chapter-legacy-book-2-5',
    'chapter-legacy-book-2-6',
    'chapter-legacy-book-2-7',
    'chapter-legacy-book-2-8',
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
    'chapter-tide-archive-004',
    'chapter-tide-archive-005',
  ],
}

const EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS: Record<
  string,
  { sequence: number; access: string }
> = {
  'chapter-sealed-gate': { sequence: 3, access: CHAPTER_ACCESS.READABLE },
  'chapter-tide-letter': { sequence: 1, access: CHAPTER_ACCESS.READABLE },
  'chapter-lighthouse-watch': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-picking-up-the-sword': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-mountain-gate': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-immortal-tribulation': {
    sequence: 3,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-tide-city-004': { sequence: 4, access: CHAPTER_ACCESS.READABLE },
  'chapter-tide-city-005': { sequence: 5, access: CHAPTER_ACCESS.READABLE },
  'chapter-tide-city-006': { sequence: 6, access: CHAPTER_ACCESS.READABLE },
  'chapter-tide-city-007': { sequence: 7, access: CHAPTER_ACCESS.READABLE },
  'chapter-tide-city-008': { sequence: 8, access: CHAPTER_ACCESS.READABLE },
  'chapter-frost-immortal-004': {
    sequence: 4,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-frost-immortal-005': {
    sequence: 5,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-frost-immortal-006': {
    sequence: 6,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-frost-immortal-007': {
    sequence: 7,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-frost-immortal-008': {
    sequence: 8,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-reason-for-overtime': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-elevator-silence': { sequence: 2, access: CHAPTER_ACCESS.READABLE },
  'chapter-break-room-truth': { sequence: 3, access: CHAPTER_ACCESS.READABLE },
  'chapter-midnight-office-004': {
    sequence: 4,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-midnight-office-005': {
    sequence: 5,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-midnight-office-006': {
    sequence: 6,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-midnight-office-007': {
    sequence: 7,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-midnight-office-008': {
    sequence: 8,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-decade-late-letter': {
    sequence: 1,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-rainy-day-umbrella': {
    sequence: 2,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-after-reunion': { sequence: 3, access: CHAPTER_ACCESS.READABLE },
  'chapter-plum-rain-letter-004': {
    sequence: 4,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-plum-rain-letter-005': {
    sequence: 5,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-plum-rain-letter-006': {
    sequence: 6,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-plum-rain-letter-007': {
    sequence: 7,
    access: CHAPTER_ACCESS.READABLE,
  },
  'chapter-plum-rain-letter-008': {
    sequence: 8,
    access: CHAPTER_ACCESS.READABLE,
  },
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
}

for (const bookId of ['book-legacy-book-1', 'book-legacy-book-2']) {
  const legacyBookId = bookId.replace('book-legacy-', '')

  for (let sequence = 1; sequence <= 8; sequence += 1) {
    EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS[`chapter-legacy-${legacyBookId}-${sequence}`] = {
      sequence,
      access: CHAPTER_ACCESS.READABLE,
    }
  }
}

for (const bookId of ['book-legacy-book-3', 'book-legacy-book-6', 'book-legacy-book-4', 'book-legacy-book-5']) {
  const legacyBookId = bookId.replace('book-legacy-', '')

  for (let sequence = 1; sequence <= 13; sequence += 1) {
    EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS[`chapter-legacy-${legacyBookId}-${sequence}`] = {
      sequence,
      access: CHAPTER_ACCESS.READABLE,
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
  'chapter-after-reunion': [
    '轉角書店門口的雨勢小了一點，簷下卻還掛著一串串水線。蘇晚把那封信放在兩人之間，沒有收回包裡：「現在可以說了嗎，程遠？」',
    '程遠看著信封，手指在傘柄上慢慢收緊。他沒有像剛才那樣替她擋住雨，只在對面的椅子坐下：「可以。十年前離開，是我自己選的，不是妳做錯了什麼，也不是誰逼我。」',
    '那年他拿到外地的工作，明知道只要開口，蘇晚會送他到車站，還是把行李搬走的時間藏到最後。車開之前，他把傘留給她，自己先轉身上車；那不是體貼，只是他當時能想出的、最廉價的補償。',
    '「你連一句再見都沒有。」蘇晚的聲音很輕，卻沒有給他躲避的餘地。程遠低下眼睛：「我知道。我怕看見妳失望，也怕妳問我什麼時候回來，所以選了最省事的方式，讓妳只能對著一個空位生氣。」',
    '她指尖壓住信封邊緣：「那這封信呢？」',
    '「是我離開前一晚寫的。」程遠說，「那時候我寫了很多保證，說等我站穩就回來，說有些話不會拖太久。寫完我沒有寄，因為我知道自己做不到，卻又沒有勇氣把這件事承認給妳看。信一直收在行李底層，直到這次回來整理東西，才又被我找到。」',
    '「所以十年前的字，是真的；新的郵戳，也是你現在才寄的？」蘇晚問。程遠點頭：「地址雖然舊，房子還有人代收。我只把原信封交給郵局，沒有改掉十年前的字。信沒有穿過十年，是我把它晚了十年才送出去。」',
    '蘇晚沒有立刻打開信，先問：「你現在有能力了嗎？」程遠沉默了一會兒，才說：「沒有。我只是終於明白，『等我準備好』其實是把責任推給以後。我已經把下週離開的車票退掉了，接下來幾個月會留在鎮上工作。這不是要妳等我，是我自己選擇不再逃。」',
    '她終於拆開信，讀到那句熟悉的保證，又把紙折了回去：「一封信不能把十年補回來。我也不會因為你終於寄出它，就當作我沒有等過、沒有怨過。」',
    '「我不要求妳原諒我。」程遠把傘靠在椅邊，像是把決定放回她手裡，「妳想問什麼，我會回答。妳不想見我，我也不會去找妳要答案。」雨聲落在玻璃上，兩人之間安靜了很久，這一次誰也沒有先替沉默下結論。',
    '蘇晚看著他良久，才說：「明天下午五點，還是在這裡。你把沒說完的話說完，我會問我想問的。」程遠答得很快：「好。」她又補了一句：「但這不是原諒，也不是重新開始。」他點頭：「我知道。對我來說，先準時出現就夠了。」',
    '她把信收進包裡，沒有把它貼近心口。走到簷下時，她伸手握住傘柄的另一側：「送我到巷口吧，傘我拿一半。」程遠把傘往她那邊移了一點，兩人並肩走進雨裡；十年前的字和今天的新郵戳仍在她包裡，而明天下午五點，已經是一個由他們一起做出的約定。',
  ],
}

for (const fixtureChapter of tideArchiveFixture.chapters) {
  EXPECTED_CHAPTER_SEQUENCE_AND_ACCESS[fixtureChapter.chapterId] = {
    sequence: fixtureChapter.sequence,
    access: fixtureChapter.access,
  }
  EXPECTED_ACCESSIBLE_PROSE[fixtureChapter.chapterId] = fixtureChapter.prose
}

for (const fixture of [
  tideCityFixture,
  frostImmortalFixture,
  midnightOfficeFixture,
]) {
  const fixtureChapter = fixture.chapters.find(
    (chapter) => chapter.sequence === 3,
  )

  if (fixtureChapter?.access === 'READABLE' && fixtureChapter.prose) {
    EXPECTED_ACCESSIBLE_PROSE[fixtureChapter.chapterId] = fixtureChapter.prose
  }
}

const LOCKED_CHAPTER_IDS = [] as const

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

  it('retains book-tide-city in authored sequence order 3,1,2,4,5,6,7,8', () => {
    const repository = new StaticContentRepository()
    const entry = repository.getBook('book-tide-city')

    expect(entry?.chapters.map((chapter) => chapter.sequence)).toEqual([
      3, 1, 2,
      4, 5, 6, 7, 8,
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

  it('has no LOCKED chapters and no UNAVAILABLE chapters', () => {
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
    expect(locked).toHaveLength(0)
    expect(unavailable).toHaveLength(0)
  })

  it('returns exact prose for every accessible chapter', () => {
    const repository = new StaticContentRepository()

    for (const [chapterId, expectedProse] of Object.entries(
      EXPECTED_ACCESSIBLE_PROSE,
    )) {
      expect(repository.getChapterProse(chapterId)).toEqual(expectedProse)
    }

    expect(Object.keys(EXPECTED_ACCESSIBLE_PROSE)).toHaveLength(17)
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

  it('returns undefined prose for an unknown chapter id', () => {
    const repository = new StaticContentRepository()

    expect(repository.getChapterProse('chapter-does-not-exist')).toBeUndefined()
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

  it.each([
    ['book-tide-city', tideCityFixture],
    ['book-frost-immortal', frostImmortalFixture],
    ['book-midnight-office', midnightOfficeFixture],
    ['book-plum-rain-letter', plumRainLetterFixture],
  ])(
    '%s has exactly eight READABLE chapters with substantive fixture-matching prose',
    (bookId, fixture) => {
      const repository = new StaticContentRepository()
      const entry = repository.getBook(bookId)

      expect(entry?.chapters).toHaveLength(8)
      expect(entry?.chapters.map((chapter) => chapter.sequence)).toEqual(
        bookId === 'book-tide-city'
          ? [3, 1, 2, 4, 5, 6, 7, 8]
          : [1, 2, 3, 4, 5, 6, 7, 8],
      )
      expect(entry?.chapters.every((chapter) => chapter.access === CHAPTER_ACCESS.READABLE)).toBe(true)

      for (const fixtureChapter of fixture.chapters) {
        const prose = repository.getChapterProse(fixtureChapter.chapterId)

        expect(prose, fixtureChapter.chapterId).toEqual(fixtureChapter.prose)
        expect(prose?.length).toBeGreaterThan(0)
        if (fixtureChapter.sequence >= 4) {
          expect(prose?.length).toBeGreaterThanOrEqual(12)
        }
      }
    },
  )

  it.each([
    ['book-tide-city', tideCityFixture],
    ['book-frost-immortal', frostImmortalFixture],
    ['book-midnight-office', midnightOfficeFixture],
    ['book-plum-rain-letter', plumRainLetterFixture],
  ])(
    '%s opens Chapter 4 and navigates through the new final Chapter 8',
    (bookIdValue, fixture) => {
      const repository = new StaticContentRepository()
      const state = {
        load: () => undefined,
        save: () => undefined,
        listSavedPositions: () => [],
      }
      const entry = repository.getBook(bookIdValue)
      const chapterFour = entry?.chapters.find((chapter) => chapter.sequence === 4)

      const opened = openReadingChapter(repository, state, {
        bookId: bookId(bookIdValue),
        chapterId: chapterFour?.id as ReturnType<typeof chapterId>,
        paragraphIndex: 0,
        chapterProgress: 0,
      })

      expect(opened?.prose).toEqual(
        fixture.chapters.find((chapter) => chapter.sequence === 4)?.prose,
      )
      expect(opened?.hasPrevious).toBe(true)
      expect(opened?.hasNext).toBe(true)

      let current = opened as NonNullable<typeof opened>
      while (current.hasNext) {
        const next = navigateToAdjacentChapter(repository, state, current, 1)
        expect(next).toBeDefined()
        current = next as NonNullable<typeof next>
      }

      expect(current.chapter.sequence).toBe(8)
      expect(current.hasNext).toBe(false)
      expect(current.prose).toEqual(
        fixture.chapters.find((chapter) => chapter.sequence === 8)?.prose,
      )
    },
  )
})
