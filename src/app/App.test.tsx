import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ContentBook,
  ContentRepository,
} from '../application/catalog/contentRepository'
import { AuthoringGatewayClientAdapter } from '../application/authoring/authoringGatewayClient'
import { createAuthoringGatewayHandler } from '../infrastructure/authoring/authoringGateway'
import { CHAPTER_ACCESS } from '../domain/access/chapterAccess'
import { chapterSequence } from '../domain/catalog/chapter'
import { bookId, chapterId } from '../domain/catalog/identifiers'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import {
  ACTIVE_READER_SESSION_STORAGE_KEY,
  LocalStorageActiveReaderSessionRepository,
} from '../infrastructure/persistence/localStorageActiveReaderSessionRepository'
import {
  LocalStorageChapterBookmarksRepository,
  CHAPTER_BOOKMARKS_STORAGE_KEY,
} from '../infrastructure/persistence/localStorageChapterBookmarksRepository'
import { LocalStorageBookShelfRepository } from '../infrastructure/persistence/localStorageBookShelfRepository'
import {
  LocalStorageReaderPreferencesRepository,
  READER_PREFERENCES_STORAGE_KEY,
} from '../infrastructure/persistence/localStorageReaderPreferencesRepository'
import { LocalStorageRecentReadingRepository } from '../infrastructure/persistence/localStorageRecentReadingRepository'
import {
  LocalStorageReadingStateRepository,
  READING_STATE_STORAGE_KEY,
} from '../infrastructure/persistence/localStorageReadingStateRepository'
import App, { type AppDependencies } from './App'

function createDependencies(): AppDependencies {
  return {
    contentRepository: new StaticContentRepository(),
    readingStateRepository: new LocalStorageReadingStateRepository(
      window.localStorage,
    ),
    bookShelfRepository: new LocalStorageBookShelfRepository(
      window.localStorage,
    ),
    recentReadingRepository: new LocalStorageRecentReadingRepository(
      window.localStorage,
    ),
    readerPreferencesRepository: new LocalStorageReaderPreferencesRepository(
      window.localStorage,
    ),
    chapterBookmarksRepository: new LocalStorageChapterBookmarksRepository(
      window.localStorage,
    ),
    activeReaderSessionRepository: new LocalStorageActiveReaderSessionRepository(
      window.localStorage,
    ),
  }
}

function openBookDetail() {
  // The Wave 1 demo book (潮汐之城) is retained at catalog index 0.
  fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
}

function createAccessStatusRepository() {
  const accessStatusBookId = bookId('book-access-status')
  const book: ContentBook = {
    book: {
      id: accessStatusBookId,
      title: '權限測試之書',
      authorName: '測試作者',
      categoryLabel: '測試',
    },
    description: '驗證章節狀態與安全閱讀路徑。',
    chapters: [
      {
        id: chapterId('chapter-unavailable'),
        bookId: accessStatusBookId,
        title: '第四章：尚未提供',
        sequence: chapterSequence(4),
        access: CHAPTER_ACCESS.UNAVAILABLE,
      },
      {
        id: chapterId('chapter-preview'),
        bookId: accessStatusBookId,
        title: '第二章：安全試閱',
        sequence: chapterSequence(2),
        access: CHAPTER_ACCESS.PREVIEW,
      },
      {
        id: chapterId('chapter-locked'),
        bookId: accessStatusBookId,
        title: '第三章：鎖定內容',
        sequence: chapterSequence(3),
        access: CHAPTER_ACCESS.LOCKED,
      },
      {
        id: chapterId('chapter-readable'),
        bookId: accessStatusBookId,
        title: '第一章：完整閱讀',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
    ],
  }
  const proseByChapter = new Map<string, readonly string[]>([
    ['chapter-readable', ['完整章節內容。']],
    ['chapter-preview', ['既有試閱安全內容。']],
  ])
  const getChapterProse = vi.fn((requestedChapterId: string) =>
    proseByChapter.get(requestedChapterId),
  )
  const repository: ContentRepository = {
    listBooks: () => [book],
    getBook: (requestedBookId) =>
      requestedBookId === accessStatusBookId ? book : undefined,
    getChapterProse,
  }

  return { repository, getChapterProse }
}

describe('Wave 1 core reading journey', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('displays the demo catalog and opens Book Detail', () => {
    render(<App dependencies={createDependencies()} />)

    expect(
      screen.getByRole('heading', { name: '探索故事' }),
    ).toBeInTheDocument()
    expect(screen.getByText('潮汐之城')).toBeInTheDocument()
    const bookCard = screen.getByText('潮汐之城').closest('article')
    expect(bookCard).not.toBeNull()
    expect(
      within(bookCard as HTMLElement).getByText('懸疑'),
    ).toBeInTheDocument()

    openBookDetail()

    expect(
      screen.getByRole('heading', { name: '潮汐之城' }),
    ).toBeInTheDocument()
    expect(screen.getByText('共 13 章')).toBeInTheDocument()
  })

  it('renders every access status without prose requests and opens exact allowed chapters', () => {
    const { repository, getChapterProse } = createAccessStatusRepository()

    render(
      <App
        dependencies={{
          contentRepository: repository,
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
        }}
      />,
    )
    openBookDetail()

    const chapterList = screen.getByRole('list', { name: '章節預覽列表' })
    const chapterItems = within(chapterList).getAllByRole('listitem')
    expect(
      chapterItems.map(
        (item) => item.querySelector('.book-chapter-title')?.textContent,
      ),
    ).toEqual([
      '第一章：完整閱讀',
      '第二章：安全試閱',
      '第三章：鎖定內容',
      '第四章：尚未提供',
    ])
    expect(getChapterProse).not.toHaveBeenCalled()

    const lockedItem = screen.getByText('第三章：鎖定內容').closest('li')
    const unavailableItem = screen.getByText('第四章：尚未提供').closest('li')
    expect(within(lockedItem as HTMLElement).getByText('已鎖定')).toBeInTheDocument()
    expect(within(lockedItem as HTMLElement).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(unavailableItem as HTMLElement).getByText('暫不可用'),
    ).toBeInTheDocument()
    expect(
      within(unavailableItem as HTMLElement).queryByRole('button'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '權限測試之書' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: '開始試閱：第二章：安全試閱（試閱）',
      }),
    )

    expect(
      screen.getByRole('heading', { name: '第二章：安全試閱' }),
    ).toBeInTheDocument()
    expect(screen.getByText('既有試閱安全內容。')).toBeInTheDocument()
    expect(getChapterProse).toHaveBeenCalledTimes(1)
    expect(getChapterProse).toHaveBeenLastCalledWith('chapter-preview')

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(
      screen.getByRole('button', {
        name: '閱讀本章：第一章：完整閱讀（可閱讀）',
      }),
    )

    expect(
      screen.getByRole('heading', { name: '第一章：完整閱讀' }),
    ).toBeInTheDocument()
    expect(screen.getByText('完整章節內容。')).toBeInTheDocument()
    expect(getChapterProse).toHaveBeenCalledTimes(2)
    expect(getChapterProse).toHaveBeenLastCalledWith('chapter-readable')
  })

  it('starts at the first explicit-order chapter and persists its position', () => {
    render(<App dependencies={createDependencies()} />)
    openBookDetail()

    expect(
      screen.getByRole('button', { name: '開始閱讀' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('chapter-prose').length).toBeGreaterThan(2)
    expect(
      screen.getByText(
        '清晨的第一道潮聲穿過港口時，澄夏在門縫下發現一封帶著鹽晶的信。',
      ),
    ).toBeInTheDocument()

    expect(
      JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
      ),
    ).toEqual({
      schemaVersion: 2,
      positions: {
        'book-tide-city': {
          bookId: 'book-tide-city',
          chapterId: 'chapter-tide-letter',
          chapterProgress: 0,
        },
      },
    })
  })

  it('restores a saved chapter after remount and offers Continue Reading', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()

    // Exit explicitly first so this test keeps exercising the Book Detail
    // Continue CTA path; the active reader session marker (Wave 4) recovering
    // Reader directly on an un-exited remount is covered in the "mobile
    // reader session recovery" describe block below.
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: /^繼續閱讀/ }))

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
  })

  it('navigates by explicit sequence and renders the newly readable third chapter', () => {
    const contentRepository = new StaticContentRepository()
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')

    render(
      <App
        dependencies={{
          contentRepository,
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
        }}
      />,
    )
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    const reader = screen.getByLabelText('閱讀器')
    expect(
      within(reader).getByRole('heading', { name: '第三章：封印之門' }),
    ).toBeInTheDocument()
    expect(
      within(reader).queryByText('本章尚未開放，沒有載入任何內文。'),
    ).not.toBeInTheDocument()
    expect(within(reader).queryAllByTestId('chapter-prose')).toHaveLength(10)
    expect(proseRequest).toHaveBeenCalledTimes(3)
    expect(proseRequest).toHaveBeenCalledWith('chapter-sealed-gate')
  })
})

describe('Wave 2 catalog discovery and continue-reading parity', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function openBookAt(index: number) {
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[index])
  }

  function backToCatalog() {
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
  }

  it('renders exactly thirteen books in the catalog', () => {
    render(<App dependencies={createDependencies()} />)

    expect(screen.getAllByRole('article')).toHaveLength(13)
  })

  it('preserves stable Book IDs through Book Detail navigation for every catalog position', () => {
    render(<App dependencies={createDependencies()} />)

    const expectedTitles = ['潮汐之城', '霜劍仙途', '午夜寫字樓', '梅雨與信']

    expectedTitles.forEach((title, index) => {
      openBookAt(index)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    })
  })

  it('lets a newly added book Start Reading at its first accessible chapter', () => {
    render(<App dependencies={createDependencies()} />)

    openBookAt(1)
    expect(screen.getByRole('button', { name: '開始閱讀' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    expect(
      screen.getByRole('heading', { name: '第一章：拾劍' }),
    ).toBeInTheDocument()
  })

  it('lets a newly added book Continue Reading after remount', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookAt(1)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(
      screen.getByRole('heading', { name: '第二章：入山門' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    openBookAt(1)
    fireEvent.click(screen.getByRole('button', { name: /^繼續閱讀/ }))

    expect(
      screen.getByRole('heading', { name: '第二章：入山門' }),
    ).toBeInTheDocument()
  })

  it('shows 繼續閱讀 only once a valid position exists, listing saved books in catalog order', () => {
    render(<App dependencies={createDependencies()} />)

    expect(
      screen.queryByRole('heading', { name: '繼續閱讀' }),
    ).not.toBeInTheDocument()

    // Save a position for book index 2 (午夜寫字樓) first, then index 0 (潮汐之城).
    openBookAt(2)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    backToCatalog()

    openBookAt(0)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    backToCatalog()

    const shelf = screen.getByRole('region', { name: '繼續閱讀' })
    const titles = within(shelf)
      .getAllByText(/^(潮汐之城|午夜寫字樓)$/)
      .map((node) => node.textContent)

    expect(titles).toEqual(['潮汐之城', '午夜寫字樓'])
  })

  it('restores the correct saved chapter when a Continue Reading shelf action is used', () => {
    render(<App dependencies={createDependencies()} />)

    openBookAt(2)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    backToCatalog()

    const shelf = screen.getByRole('region', { name: '繼續閱讀' })
    fireEvent.click(within(shelf).getByRole('button', { name: '繼續閱讀' }))

    expect(
      screen.getByRole('heading', { name: '第二章：電梯裡的沉默' }),
    ).toBeInTheDocument()
  })

  it('ignores an unknown saved Book ID without showing it on the shelf', () => {
    window.localStorage.setItem(
      READING_STATE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        positions: {
          'book-does-not-exist': {
            bookId: 'book-does-not-exist',
            chapterId: 'chapter-x',
          },
        },
      }),
    )

    render(<App dependencies={createDependencies()} />)

    expect(
      screen.queryByRole('heading', { name: '繼續閱讀' }),
    ).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(13)
  })

  it('ignores a saved position pointing at an unknown Chapter ID', () => {
    window.localStorage.setItem(
      READING_STATE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        positions: {
          'book-tide-city': {
            bookId: 'book-tide-city',
            chapterId: 'chapter-does-not-exist',
          },
        },
      }),
    )

    render(<App dependencies={createDependencies()} />)

    expect(
      screen.queryByRole('heading', { name: '繼續閱讀' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    { bookIndex: 0, readableChapterId: 'chapter-sealed-gate' },
    { bookIndex: 1, readableChapterId: 'chapter-immortal-tribulation' },
    { bookIndex: 2, readableChapterId: 'chapter-break-room-truth' },
    { bookIndex: 3, readableChapterId: 'chapter-after-reunion' },
  ])(
    'opens the readable third chapter for book index $bookIndex',
    ({ bookIndex, readableChapterId }) => {
      const contentRepository = new StaticContentRepository()
      const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')

      render(
        <App
          dependencies={{
            contentRepository,
            readingStateRepository: new LocalStorageReadingStateRepository(
              window.localStorage,
            ),
          }}
        />,
      )

      openBookAt(bookIndex)
      fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
      fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
      fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

      const reader = screen.getByLabelText('閱讀器')
      expect(
        within(reader).queryByText('本章尚未開放，沒有載入任何內文。'),
      ).not.toBeInTheDocument()
      expect(within(reader).queryAllByTestId('chapter-prose').length).toBeGreaterThan(0)
      expect(proseRequest).toHaveBeenCalledTimes(3)
      expect(proseRequest).toHaveBeenCalledWith(readableChapterId)
    },
  )
})

describe('Wave 4 Reader Comfort Preferences & Chapter Bookmarks Integration', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function openFirstBookReader() {
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: /^(開始閱讀|繼續閱讀)/ }))
  }

  it('persists and restores reader preferences across remounts and resets to default', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)
    openFirstBookReader()
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))

    fireEvent.click(screen.getByRole('radio', { name: '大' }))
    fireEvent.click(screen.getByRole('radio', { name: '襯線' }))
    fireEvent.click(screen.getByRole('radio', { name: '寬鬆' }))
    fireEvent.click(screen.getByRole('radio', { name: '寬鬆字距' }))
    fireEvent.click(screen.getByRole('radio', { name: '護眼' }))
    fireEvent.click(screen.getByRole('radio', { name: '分頁閱讀' }))

    const savedPrefs = JSON.parse(
      window.localStorage.getItem(READER_PREFERENCES_STORAGE_KEY) ?? '',
    )
    expect(savedPrefs).toEqual({
      schemaVersion: 1,
      fontFamily: 'serif',
      fontScale: 'large',
      letterSpacing: 'relaxed',
      lineSpacing: 'spacious',
      readingMode: 'paged',
      theme: 'sepia',
    })

    firstMount.unmount()

    // The active reader session marker (Wave 4) means an un-exited remount
    // recovers straight back into Reader; no need to navigate through Book
    // Detail again to reach it.
    render(<App dependencies={createDependencies()} />)

    const section = screen.getByLabelText('閱讀器')
    expect(section.getAttribute('data-theme')).toBe('sepia')
    expect(section.getAttribute('data-font-family')).toBe('serif')
    expect(section.getAttribute('data-font-scale')).toBe('large')
    expect(section.getAttribute('data-letter-spacing')).toBe('relaxed')
    expect(section.getAttribute('data-line-spacing')).toBe('spacious')
    expect(section.getAttribute('data-reading-mode')).toBe('paged')

    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))
    fireEvent.click(screen.getByRole('button', { name: '重設預設值' }))
    expect(section.getAttribute('data-theme')).toBe('light')
    expect(section.getAttribute('data-font-family')).toBe('sans-serif')
    expect(section.getAttribute('data-font-scale')).toBe('medium')
    expect(section.getAttribute('data-letter-spacing')).toBe('normal')
    expect(section.getAttribute('data-line-spacing')).toBe('comfortable')
    expect(section.getAttribute('data-reading-mode')).toBe('continuous')
  })

  it('handles preference changes without altering ReadingPosition', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    const initialPos = window.localStorage.getItem(READING_STATE_STORAGE_KEY)
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))
    fireEvent.click(screen.getByRole('radio', { name: '暗黑' }))
    const afterPos = window.localStorage.getItem(READING_STATE_STORAGE_KEY)

    expect(initialPos).toBe(afterPos)
  })

  it('allows bookmarking accessible chapter, listing bookmarks, and jumping via bookmark', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    // Bookmark Chapter 1 of Book 0 (潮聲來信)
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))

    const savedBookmarks = JSON.parse(
      window.localStorage.getItem(CHAPTER_BOOKMARKS_STORAGE_KEY) ?? '',
    )
    expect(savedBookmarks.bookmarks).toEqual([
      { bookId: 'book-tide-city', chapterId: 'chapter-tide-letter' },
    ])

    // Move to Chapter 2
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()

    // Open Bookmarks Modal
    fireEvent.click(screen.getByRole('button', { name: '開啟書籤列表' }))

    const modal = screen.getByRole('dialog', { name: '章節書籤' })
    expect(within(modal).getByText('第一章：潮聲來信')).toBeInTheDocument()

    // Jump to Chapter 1 via bookmark
    fireEvent.click(within(modal).getByRole('button', { name: '移至章節' }))

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()
  })

  it('opens the readable third chapter through adjacent navigation and bookmark actions', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    // Chapter 1 -> Chapter 2 -> readable Chapter 3.
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    expect(
      screen.getByRole('heading', { name: '第三章：封印之門' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '加入章節書籤' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    const tocDialog = screen.getByRole('dialog', { name: '章節目錄' })
    const thirdChapterButton = within(tocDialog)
      .getByText('第三章：封印之門')
      .closest('button')
    expect(thirdChapterButton).not.toBeDisabled()
  })

  it('retains independent bookmarks across multiple books and preserves stable order', () => {
    render(<App dependencies={createDependencies()} />)

    // Book 1 (霜劍仙途) -> Chapter 1 (拾劍) -> Bookmark
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[1])
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))

    // Back to Catalog -> Book 0 (潮汐之城) -> Chapter 1 (潮聲來信) -> Bookmark
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))

    // Open Bookmarks Modal in Reader
    fireEvent.click(screen.getByRole('button', { name: '開啟書籤列表' }))
    const modal = screen.getByRole('dialog', { name: '章節書籤' })

    const chapterTitles = within(modal)
      .getAllByText(/^(第一章：潮聲來信|第一章：拾劍)$/)
      .map((node) => node.textContent)

    // Catalog order places 潮汐之城 before 霜劍仙途
    expect(chapterTitles).toEqual(['第一章：潮聲來信', '第一章：拾劍'])
  })
})

describe('Wave 4 Reader Table of Contents & Chapter Position Progress', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function openFirstBookReader() {
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: /^(開始閱讀|繼續閱讀)/ }))
  }

  function tocButtonFor(title: string) {
    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    return within(dialog).getByText(title).closest('button') as HTMLButtonElement
  }

  it('lists every chapter in explicit sequence order (not source array order) with the current chapter marked', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    const items = within(dialog).getAllByRole('listitem')
    const titles = items.map((item) => item.querySelector('button')?.textContent)

    // staticContentRepository declares chapter-sealed-gate (sequence 3) first
    // in its source array, so this also proves ordering by sequence, not
    // array position.
    expect(titles).toEqual([
      expect.stringContaining('第一章：潮聲來信'),
      expect.stringContaining('第二章：燈塔守望'),
      expect.stringContaining('第三章：封印之門'),
      expect.stringContaining('第四章：潮痕上的名字'),
      expect.stringContaining('第五章：檔案裡的空頁'),
      expect.stringContaining('第六章：兩盞同夜的燈'),
      expect.stringContaining('第七章：替誰留下'),
      expect.stringContaining('第八章：可回頭的潮聲'),
      expect.stringContaining('第九章：離岸燈站調查'),
      expect.stringContaining('第十章：撤照檔案'),
      expect.stringContaining('第十一章：拒絕的浪'),
      expect.stringContaining('第十二章：受限可讀'),
      expect.stringContaining('第十三章：離岸燈的答案'),
    ])

    expect(items[0].querySelector('button')?.getAttribute('aria-current')).toBe(
      'true',
    )
    expect(items[1].querySelector('button')?.getAttribute('aria-current')).toBeNull()
  })

  it('opens the readable chapter in the TOC and requests its prose', () => {
    const contentRepository = new StaticContentRepository()
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')

    render(
      <App
        dependencies={{
          contentRepository,
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
        }}
      />,
    )
    openFirstBookReader()

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    const readableButton = tocButtonFor('第三章：封印之門')
    expect(readableButton).not.toBeDisabled()

    fireEvent.click(readableButton)
    expect(screen.getByRole('heading', { name: '第三章：封印之門' })).toBeInTheDocument()
    expect(proseRequest).toHaveBeenCalledWith('chapter-sealed-gate')
  })

  it('jumps to an accessible chapter via the TOC using the normal Reader navigation path', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    fireEvent.click(tocButtonFor('第二章：燈塔守望'))

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    expect(
      JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
      ),
    ).toEqual({
      schemaVersion: 2,
      positions: {
        'book-tide-city': {
          bookId: 'book-tide-city',
          chapterId: 'chapter-lighthouse-watch',
          chapterProgress: 0,
        },
      },
    })
  })

  it('keeps chapter-position and live chapter progress synced across previous/next, TOC jump, and bookmark jump', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    const progress = () =>
      screen.getByRole('progressbar', { name: '目前章節位置' })
    const liveProgress = () =>
      screen.getByRole('progressbar', { name: '本章閱讀進度' })

    expect(progress()).toHaveTextContent('第 1 / 13 章')
    expect(progress().textContent).not.toMatch(/%|頁|段落/)
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    // Bookmark chapter 1 so it can be reached again via the bookmarks modal.
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 13 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 3 / 13 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getAllByRole('button', { name: '上一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 13 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    fireEvent.click(tocButtonFor('第一章：潮聲來信'))
    expect(progress()).toHaveTextContent('第 1 / 13 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 13 章')

    fireEvent.click(screen.getByRole('button', { name: '開啟書籤列表' }))
    const bookmarksDialog = screen.getByRole('dialog', { name: '章節書籤' })
    fireEvent.click(
      within(bookmarksDialog).getByRole('button', { name: '移至章節' }),
    )
    expect(progress()).toHaveTextContent('第 1 / 13 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('AI Authoring Core V1 isolation', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('previews a deterministic draft without adding it to the production catalog', async () => {
    const contentRepository = new StaticContentRepository()
    const gatewayHandler = createAuthoringGatewayHandler()
    const authoringGatewayClient = new AuthoringGatewayClientAdapter({
      fetchImpl: async (_input, init) => {
        const result = await gatewayHandler({
          method: init?.method ?? '',
          body: typeof init?.body === 'string' ? init.body : '',
        })
        return new Response(JSON.stringify(result.body), {
          status: result.status,
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    render(
      <App
        dependencies={{
          ...createDependencies(),
          contentRepository,
          authoringGatewayClient,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟創作預覽' }))
    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '一名守夜人發現城市的鐘每天少響一聲。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))

    expect(await screen.findByText('DRAFT / NOT PUBLISHED')).toBeInTheDocument()
    expect(screen.getByText('第 1 章：第1章：火種')).toBeInTheDocument()
    expect(contentRepository.listBooks()).toHaveLength(13)
    expect(
      contentRepository
        .listBooks()
        .some(({ book }) => book.title === '懸疑故事預覽'),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '返回閱讀目錄' }))
    expect(screen.getByRole('heading', { name: '探索故事' })).toBeInTheDocument()
  })

  it('imports the 潮汐檔案 Agent Draft without changing the production catalog', async () => {
    const contentRepository = new StaticContentRepository()
    const initialCatalogCount = contentRepository.listBooks().length
    const agentDraftJson = JSON.stringify({
      title: '潮汐檔案',
      genre: '科幻懸疑',
      chapters: [
        {
          sequence: 1,
          title: '沉入海底的鐘',
          prose: '第一段海水覆過鐘面。\n\n第二段城市失去第一個音節。',
        },
        {
          sequence: 2,
          title: '舊港的回聲',
          prose: '第一段舊港起霧。\n\n第二段回聲折回昨天。',
        },
        {
          sequence: 3,
          title: '第四點整',
          prose: '第一段潮汐停住。\n\n第二段空白浮出水面。',
        },
      ],
    })

    render(
      <App
        dependencies={{
          ...createDependencies(),
          contentRepository,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟創作預覽' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )

    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getByText('DRAFT / NOT PUBLISHED')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('草稿標題'), {
      target: { value: '潮汐檔案（本地編輯）' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[0], {
      target: { value: '本地編輯的第一章正文。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Chapter' }))
    fireEvent.change(screen.getAllByLabelText('章節標題')[3], {
      target: { value: '本地新增章節' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[3], {
      target: { value: '本地新增章節正文。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '上移第 4 章' }))
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 章' }))
    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))

    const exported = JSON.parse(
      (screen.getByRole('textbox', {
        name: 'Draft JSON Export',
      }) as HTMLTextAreaElement).value,
    ) as Record<string, unknown>
    expect(exported).not.toHaveProperty('status')
    expect(exported).not.toHaveProperty('quality')
    expect(exported).not.toHaveProperty('bookId')
    expect(contentRepository.listBooks()).toHaveLength(initialCatalogCount)
    expect(
      contentRepository
        .listBooks()
        .some(({ book }) => book.title === '潮汐檔案（本地編輯）'),
    ).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '返回閱讀目錄' }))
    expect(screen.getByText(`共 ${initialCatalogCount} 本`)).toBeInTheDocument()
  })
})

describe('Persistent reader chapter navigation integrated journey', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function openFirstBookReader(dependencies = createDependencies()) {
    render(<App dependencies={dependencies} />)
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
  }

  it('navigates via persistent previous and next controls, synchronizing ReadingPosition, TOC, progress, and bookmark status', () => {
    openFirstBookReader()

    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    const persistentPrev = within(persistentNav).getByRole('button', { name: '上一章' })
    const persistentNext = within(persistentNav).getByRole('button', { name: '下一章' })

    // On Chapter 1 (first chapter): Previous is disabled, Next is enabled
    expect(persistentPrev).toBeDisabled()
    expect(persistentNext).not.toBeDisabled()
    expect(screen.getByRole('heading', { name: '第一章：潮聲來信' })).toBeInTheDocument()

    // Add bookmark on Chapter 1
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))
    expect(screen.getByRole('button', { name: '移除章節書籤' })).toBeInTheDocument()

    // Click persistent Next button to go to Chapter 2 (第二章：燈塔守望)
    fireEvent.click(persistentNext)

    expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '目前章節位置' })).toHaveTextContent('第 2 / 13 章')
    expect(within(persistentNav).getByText('第 2 / 13 章')).toBeInTheDocument()
    // Chapter 2 is not bookmarked
    expect(screen.getByRole('button', { name: '加入章節書籤' })).toBeInTheDocument()

    // Verify ReadingPosition persisted in localStorage
    const storedState = JSON.parse(
      window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '{}',
    )
    expect(storedState.positions['book-tide-city']).toEqual(
      expect.objectContaining({ bookId: 'book-tide-city', chapterId: 'chapter-lighthouse-watch' }),
    )

    // Verify TOC current marker synchronized
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    const tocDialog = screen.getByRole('dialog', { name: '章節目錄' })
    const ch2Button = within(tocDialog).getByRole('button', { name: /第二章：燈塔守望/ })
    expect(ch2Button).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(tocDialog, { key: 'Escape' })

    // Newly readable Chapter 3 is reachable through adjacent navigation.
    fireEvent.click(persistentNext)
    expect(screen.getByRole('heading', { name: '第三章：封印之門' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '目前章節位置' })).toHaveTextContent('第 3 / 13 章')
    expect(
      screen.queryByText('本章尚未開放，沒有載入任何內文。'),
    ).not.toBeInTheDocument()
    expect(persistentNext).not.toBeDisabled()
    expect(persistentPrev).not.toBeDisabled()

    for (const title of [
      '第四章：潮痕上的名字',
      '第五章：檔案裡的空頁',
      '第六章：兩盞同夜的燈',
      '第七章：替誰留下',
      '第八章：可回頭的潮聲',
      '第九章：離岸燈站調查',
      '第十章：撤照檔案',
      '第十一章：拒絕的浪',
      '第十二章：受限可讀',
      '第十三章：離岸燈的答案',
    ]) {
      fireEvent.click(persistentNext)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }

    expect(screen.getByRole('progressbar', { name: '目前章節位置' })).toHaveTextContent('第 13 / 13 章')
    expect(persistentNext).toBeDisabled()

    // Previous returns to Chapter 12 after the expanded readable arc.
    fireEvent.click(persistentPrev)
    expect(screen.getByRole('heading', { name: '第十二章：受限可讀' })).toBeInTheDocument()
    expect(persistentNext).not.toBeDisabled()
    expect(persistentPrev).not.toBeDisabled()
  })

  it('routes prose swipes through adjacent navigation and requests readable prose', () => {
    const dependencies = createDependencies()
    const proseRequest = vi.spyOn(
      dependencies.contentRepository,
      'getChapterProse',
    )
    openFirstBookReader(dependencies)

    const swipeLeft = () => {
      const prose = screen.getByLabelText('章節內文')
      fireEvent.pointerDown(prose, {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: 180,
        clientY: 100,
      })
      fireEvent.pointerUp(prose, {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        clientX: 80,
        clientY: 100,
      })
    }

    swipeLeft()
    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('progressbar', { name: '目前章節位置' }),
    ).toHaveTextContent('第 2 / 13 章')

    swipeLeft()
    expect(
      screen.getByRole('heading', { name: '第三章：封印之門' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('本章尚未開放，沒有載入任何內文。'),
    ).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('chapter-prose').length).toBeGreaterThan(0)
    expect(proseRequest).toHaveBeenCalledWith('chapter-sealed-gate')
  })

  it('crosses accessible chapters through paged controls', () => {
    openFirstBookReader()
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))
    fireEvent.click(screen.getByRole('radio', { name: '分頁閱讀' }))

    fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一頁' })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '下一頁' }))
    expect(
      screen.getByRole('heading', { name: '第三章：封印之門' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByText('本章尚未開放，沒有載入任何內文。'),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上一頁' }))
    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()

    const chapterEndSurface = screen.getByTestId('chapter-end-surface')
    expect(
      within(chapterEndSurface).getByRole('button', {
        name: '繼續閱讀：第三章：封印之門',
      }),
    ).toBeInTheDocument()
  })

  it('preserves reader preferences across persistent navigation', () => {
    openFirstBookReader()
    fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))

    // Change theme to sepia (護眼) and font scale to large (大)
    fireEvent.click(screen.getByRole('radio', { name: '護眼' }))
    fireEvent.click(screen.getByRole('radio', { name: '襯線' }))
    fireEvent.click(screen.getByRole('radio', { name: '大' }))

    const section = screen.getByRole('region', { name: '閱讀器' })
    expect(section).toHaveAttribute('data-theme', 'sepia')
    expect(section).toHaveAttribute('data-font-family', 'serif')
    expect(section).toHaveAttribute('data-font-scale', 'large')

    // Navigate to next chapter via persistent nav
    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    fireEvent.click(within(persistentNav).getByRole('button', { name: '下一章' }))

    // Preferences should remain intact
    expect(section).toHaveAttribute('data-theme', 'sepia')
    expect(section).toHaveAttribute('data-font-family', 'serif')
    expect(section).toHaveAttribute('data-font-scale', 'large')
  })

  describe('Reader Exit and Resume Continuity Integration', () => {
    function openBookAt(index: number) {
      fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[index])
    }

    it('returns from Reader to matching Book Detail with accessible session-only status without resetting position', () => {
      render(<App dependencies={createDependencies()} />)

      // Open book 0 (潮汐之城) detail -> Start reading -> Next chapter (Chapter 2)
      openBookAt(0)
      fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
      const persistentNav = screen.getByTestId('reader-persistent-navigation')
      fireEvent.click(within(persistentNav).getByRole('button', { name: '下一章' }))

      expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()

      // Click 返回作品 button in Reader
      const exitBtn = screen.getByRole('button', { name: '返回作品' })
      fireEvent.click(exitBtn)

      // Should return to Book Detail for 潮汐之城
      expect(screen.getByRole('heading', { name: '潮汐之城' })).toBeInTheDocument()

      // Accessible session-only return status alert
      const statusAlert = screen.getByRole('status')
      expect(statusAlert).toBeInTheDocument()
      expect(statusAlert).toHaveTextContent('閱讀位置已保留在 第二章：燈塔守望')

      // Chapter-aware Continue button copy
      const continueBtn = screen.getByRole('button', {
        name: '繼續閱讀：第二章：燈塔守望',
      })
      expect(continueBtn).toBeInTheDocument()

      // Verify ReadingPosition in localStorage is NOT reset
      const storedState = JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '{}',
      )
      expect(storedState.positions['book-tide-city'].chapterId).toBe('chapter-lighthouse-watch')
    })

    it('clears session-only return status after subsequent navigation', () => {
      render(<App dependencies={createDependencies()} />)

      openBookAt(0)
      fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
      fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

      expect(screen.getByRole('status')).toBeInTheDocument()

      // Navigate back to catalog
      fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
      expect(screen.getByRole('heading', { name: '探索故事' })).toBeInTheDocument()

      // Re-enter Book Detail
      openBookAt(0)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('resumes exact saved chapter through Continue CTA in Book Detail and Continue shelf consistently', () => {
      render(<App dependencies={createDependencies()} />)

      openBookAt(0)
      fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
      fireEvent.click(screen.getByRole('button', { name: '閱讀設定' }))
      fireEvent.click(screen.getByRole('radio', { name: '襯線' }))
      const persistentNav = screen.getByTestId('reader-persistent-navigation')
      fireEvent.click(within(persistentNav).getByRole('button', { name: '下一章' }))
      fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

      // Re-open through Book Detail Continue CTA
      fireEvent.click(screen.getByRole('button', { name: '繼續閱讀：第二章：燈塔守望' }))
      expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
      expect(screen.getByLabelText('閱讀器')).toHaveAttribute(
        'data-font-family',
        'serif',
      )

      // Exit back to Book Detail -> Return to Catalog -> Open from Continue Shelf
      fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
      fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))

      const shelf = screen.getByRole('region', { name: '繼續閱讀' })
      expect(within(shelf).getByText('第二章：燈塔守望')).toBeInTheDocument()

      fireEvent.click(within(shelf).getByRole('button', { name: '繼續閱讀' }))
      expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
      expect(screen.getByLabelText('閱讀器')).toHaveAttribute(
        'data-font-family',
        'serif',
      )
    })

    it('falls back safely to 開始閱讀 when saved position is stale or invalid', () => {
      // Save invalid position
      window.localStorage.setItem(
        READING_STATE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          positions: {
            'book-tide-city': {
              bookId: 'book-tide-city',
              chapterId: 'stale-chapter-999',
            },
          },
        }),
      )

      render(<App dependencies={createDependencies()} />)

      openBookAt(0)
      const startBtn = screen.getByRole('button', { name: '開始閱讀' })
      expect(startBtn).toBeInTheDocument()

      fireEvent.click(startBtn)
      expect(screen.getByRole('heading', { name: '第一章：潮聲來信' })).toBeInTheDocument()
    })
  })
})

describe('Wave 5 chapter-progress persistence and restore', () => {
  let animationFrames: FrameRequestCallback[]

  beforeEach(() => {
    window.localStorage.clear()
    animationFrames = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('innerHeight', 400)
    vi.stubGlobal('scrollY', 0)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  function flushAnimationFrame() {
    const callbacks = animationFrames.splice(0)

    act(() => {
      callbacks.forEach((callback) => callback(0))
    })
  }

  function mockReaderGeometry(readerTopRef: { current: number }) {
    const reader = screen.getByLabelText('閱讀器')
    const readerHeight = 1000

    Object.defineProperty(reader, 'scrollHeight', {
      configurable: true,
      value: readerHeight,
    })
    vi.spyOn(reader, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: readerTopRef.current + readerHeight,
      height: readerHeight,
      left: 0,
      right: 640,
      top: readerTopRef.current,
      width: 640,
      x: 0,
      y: readerTopRef.current,
      toJSON: () => ({}),
    }))

    return reader
  }

  function mockRealisticScrollTo(readerTopRef: { current: number }) {
    return vi
      .spyOn(window, 'scrollTo')
      .mockImplementation((_x?: unknown, y?: unknown) => {
        const targetY = typeof y === 'number' ? y : 0
        vi.stubGlobal('scrollY', targetY)
        readerTopRef.current = -targetY
      })
  }

  it('persists live scroll progress and restores it within tolerance through 返回作品 -> Continue', () => {
    render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    const readerTopRef = { current: 0 }
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    readerTopRef.current = -420
    vi.stubGlobal('scrollY', 420)
    fireEvent.scroll(window)
    flushAnimationFrame()

    const savedState = JSON.parse(
      window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '{}',
    )
    expect(
      savedState.positions['book-tide-city'].chapterProgress,
    ).toBeCloseTo(0.7, 5)

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: /^繼續閱讀/ }))

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()

    const scrollToSpy = mockRealisticScrollTo(readerTopRef)
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 420)
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '70')
  })

  it('persists live scroll progress and restores it within tolerance through an active-session hard reload', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    const readerTopRef = { current: 0 }
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    readerTopRef.current = -180
    vi.stubGlobal('scrollY', 180)
    fireEvent.scroll(window)
    flushAnimationFrame()

    // Hard reload: unmount without an explicit exit, so the active-session
    // marker survives and the next mount recovers straight back into Reader.
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()

    const scrollToSpy = mockRealisticScrollTo(readerTopRef)
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 180)
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '30')
  })

  it('does not leak chapter-progress into a freshly navigated adjacent chapter', () => {
    render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    const readerTopRef = { current: 0 }
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    readerTopRef.current = -300
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    flushAnimationFrame()

    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '50')

    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation((_x?: unknown, y?: unknown) => {
        const targetY = typeof y === 'number' ? y : 0
        vi.stubGlobal('scrollY', targetY)
        readerTopRef.current = -targetY
      })
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()

    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 0)
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps adjacent-chapter progress semantics unchanged when navigation begins with a prose swipe', () => {
    render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    const readerTopRef = { current: 0 }
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    readerTopRef.current = -300
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    flushAnimationFrame()

    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '50')

    const prose = screen.getByLabelText('章節內文')
    fireEvent.pointerDown(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 180,
      clientY: 100,
    })
    fireEvent.pointerUp(prose, {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: 80,
      clientY: 100,
    })

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()

    readerTopRef.current = 0
    vi.stubGlobal('scrollY', 0)
    mockReaderGeometry(readerTopRef)
    flushAnimationFrame()

    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '0')
    expect(
      JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '{}',
      ).positions['book-tide-city'],
    ).toEqual(
      expect.objectContaining({
        chapterId: 'chapter-lighthouse-watch',
        chapterProgress: 0,
      }),
    )
  })
})

describe('Wave 4 mobile reader session recovery', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function rawMarker(): unknown {
    const raw = window.localStorage.getItem(ACTIVE_READER_SESSION_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  }

  function openBookAt(index: number) {
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[index])
  }

  it('records the active BookId when entering Reader', () => {
    render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    expect(rawMarker()).toEqual({
      schemaVersion: 1,
      activeBookId: 'book-tide-city',
    })
  })

  it('restores Reader at the exact saved chapter after a hard reload, with an accessible recovery status', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    const status = screen.getByText('已恢復上次閱讀：第二章：燈塔守望')
    expect(status).toHaveAttribute('role', 'status')
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('does not persist the recovery status itself alongside the marker', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    firstMount.unmount()

    expect(rawMarker()).toEqual({
      schemaVersion: 1,
      activeBookId: 'book-tide-city',
    })
  })

  it('clears the marker on explicit 返回作品, and does not reopen Reader after a subsequent reload', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

    expect(rawMarker()).toBeNull()
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    expect(screen.getAllByRole('article')).toHaveLength(13)
    expect(screen.queryByLabelText('閱讀器')).not.toBeInTheDocument()
  })

  it('clearing the marker on exit does not modify the saved ReadingPosition', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    const savedBeforeExit = window.localStorage.getItem(READING_STATE_STORAGE_KEY)
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

    expect(window.localStorage.getItem(READING_STATE_STORAGE_KEY)).toBe(
      savedBeforeExit,
    )
    firstMount.unmount()
  })

  it('chapter navigation does not add duplicate chapter state to the active-session marker', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    expect(rawMarker()).toEqual({
      schemaVersion: 1,
      activeBookId: 'book-tide-city',
    })
    firstMount.unmount()
  })

  it('recovers a jump-to-bookmark entry into a different book on the next reload', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    // Bookmark book-tide-city's second chapter first.
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))

    // Enter Reader in a different book (index 1), then jump to the bookmark.
    openBookAt(1)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    expect(rawMarker()).toEqual({
      schemaVersion: 1,
      activeBookId: 'book-frost-immortal',
    })

    fireEvent.click(screen.getByRole('button', { name: '開啟書籤列表' }))
    fireEvent.click(screen.getByRole('button', { name: '移至章節' }))

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    expect(rawMarker()).toEqual({
      schemaVersion: 1,
      activeBookId: 'book-tide-city',
    })
    firstMount.unmount()
  })

  it('falls back to safe Catalog startup and clears a malformed marker', () => {
    window.localStorage.setItem(ACTIVE_READER_SESSION_STORAGE_KEY, '{broken json')

    render(<App dependencies={createDependencies()} />)

    expect(screen.getAllByRole('article')).toHaveLength(13)
    expect(rawMarker()).toBeNull()
  })

  it('falls back to safe Catalog startup and clears a marker naming an unknown BookId', () => {
    window.localStorage.setItem(
      ACTIVE_READER_SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, activeBookId: 'book-does-not-exist' }),
    )

    render(<App dependencies={createDependencies()} />)

    expect(screen.getAllByRole('article')).toHaveLength(13)
    expect(rawMarker()).toBeNull()
  })

  it('recovers to the first accessible chapter, requesting no locked prose, when the saved ReadingPosition is stale', () => {
    window.localStorage.setItem(
      READING_STATE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        positions: {
          'book-tide-city': {
            bookId: 'book-tide-city',
            chapterId: 'stale-chapter-999',
          },
        },
      }),
    )
    window.localStorage.setItem(
      ACTIVE_READER_SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, activeBookId: 'book-tide-city' }),
    )

    const contentRepository = new StaticContentRepository()
    const proseRequest = vi.spyOn(contentRepository, 'getChapterProse')

    render(
      <App
        dependencies={{
          contentRepository,
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
          activeReaderSessionRepository:
            new LocalStorageActiveReaderSessionRepository(window.localStorage),
        }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()
    expect(proseRequest).not.toHaveBeenCalledWith('chapter-sealed-gate')
  })

  it('does not automatically reopen Reader after explicit exit, even offline-style with no further interaction', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    render(<App dependencies={createDependencies()} />)

    expect(screen.queryAllByLabelText('閱讀器')).toHaveLength(0)
  })

  it('has no direct localStorage access from the Reader feature UI module', async () => {
    const path = await import('node:path')
    const fs = await import('node:fs/promises')
    const source = await fs.readFile(
      path.join(process.cwd(), 'src/features/reader/ReaderScreen.tsx'),
      'utf-8',
    )

    expect(source).not.toMatch(/localStorage/)
  })
})

describe('Bookshelf and Recent Reading v1', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  function openBookAt(index: number) {
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[index])
  }

  function openLibrary() {
    fireEvent.click(screen.getByRole('button', { name: '我的書架' }))
  }

  it('navigates through Library, records real recent order, persists state, and preserves resume after removal', () => {
    const firstMount = render(<App dependencies={createDependencies()} />)

    openLibrary()
    expect(screen.getByRole('heading', { name: '我的書架', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('還沒有收藏小說，從書城挑一本加入書架。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前往書城' }))
    openBookAt(0)
    fireEvent.click(screen.getByRole('button', { name: '加入書架' }))
    expect(screen.getByRole('button', { name: '移出書架' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    openLibrary()

    let shelf = screen.getByRole('region', { name: '我的書架' })
    expect(within(shelf).getByText('潮汐之城')).toBeInTheDocument()
    fireEvent.click(within(shelf).getByRole('button', { name: '查看書籍' }))
    expect(screen.getByRole('heading', { name: '潮汐之城' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回我的書架' }))

    shelf = screen.getByRole('region', { name: '我的書架' })
    fireEvent.click(within(shelf).getByRole('button', { name: '查看書籍' }))
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回我的書架' }))
    fireEvent.click(screen.getByRole('button', { name: '書城' }))

    openBookAt(1)
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    openLibrary()

    const recent = screen.getByRole('region', { name: '最近閱讀' })
    expect(
      within(recent)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('h3')?.textContent),
    ).toEqual(['霜劍仙途', '潮汐之城'])

    firstMount.unmount()
    render(<App dependencies={createDependencies()} />)
    openLibrary()

    shelf = screen.getByRole('region', { name: '我的書架' })
    expect(within(shelf).getByText('潮汐之城')).toBeInTheDocument()
    const persistedRecent = screen.getByRole('region', { name: '最近閱讀' })
    expect(
      within(persistedRecent)
        .getAllByRole('listitem')
        .map((item) => item.querySelector('h3')?.textContent),
    ).toEqual(['霜劍仙途', '潮汐之城'])

    fireEvent.click(within(shelf).getByRole('button', { name: '移出書架' }))
    expect(within(shelf).queryByText('潮汐之城')).not.toBeInTheDocument()
    expect(within(persistedRecent).getByText('潮汐之城')).toBeInTheDocument()

    const removedBookRecent = within(persistedRecent)
      .getByText('潮汐之城')
      .closest('li') as HTMLElement
    fireEvent.click(
      within(removedBookRecent).getByRole('button', { name: '繼續閱讀' }),
    )
    expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
  })

  it('records a direct chapter open in Recent Reading without changing shelf membership', () => {
    render(<App dependencies={createDependencies()} />)

    openBookAt(0)
    fireEvent.click(
      screen.getByRole('button', {
        name: '閱讀本章：第一章：潮聲來信（可閱讀）',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    openLibrary()

    expect(
      within(screen.getByRole('region', { name: '最近閱讀' })).getByText(
        '潮汐之城',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: '我的書架' })).queryByText(
        '潮汐之城',
      ),
    ).not.toBeInTheDocument()
  })
})

describe('Mobile app shell navigation v1', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('switches between the two app destinations with one current-page state', () => {
    render(<App dependencies={createDependencies()} />)

    let navigation = screen.getByRole('navigation', { name: '主要導覽' })
    expect(
      within(navigation).getByRole('button', { name: '書城' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(
      within(navigation).getByRole('button', { name: '我的書架' }),
    ).not.toHaveAttribute('aria-current')
    expect(
      screen.getAllByRole('button', { name: '我的書架' }),
    ).toHaveLength(1)

    fireEvent.click(
      within(navigation).getByRole('button', { name: '我的書架' }),
    )

    expect(
      screen.getByRole('heading', { name: '我的書架', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '返回書城' }),
    ).not.toBeInTheDocument()
    navigation = screen.getByRole('navigation', { name: '主要導覽' })
    expect(
      within(navigation).getByRole('button', { name: '我的書架' }),
    ).toHaveAttribute('aria-current', 'page')

    fireEvent.click(within(navigation).getByRole('button', { name: '書城' }))

    expect(
      screen.getByRole('heading', { name: '探索故事' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '書城' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('keeps Book Detail, Reader, and Authoring outside consumer navigation', () => {
    render(<App dependencies={createDependencies()} />)

    openBookDetail()
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    expect(screen.getByLabelText('閱讀器')).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    expect(screen.getByRole('button', { name: '書城' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟創作預覽' }))
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()
  })

  it('preserves shelf, recent-reading, and Library return context across tab switches', () => {
    render(<App dependencies={createDependencies()} />)

    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '加入書架' }))
    fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))
    fireEvent.click(screen.getByRole('button', { name: '我的書架' }))

    let shelf = screen.getByRole('region', { name: '我的書架' })
    fireEvent.click(within(shelf).getByRole('button', { name: '查看書籍' }))
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    expect(
      screen.queryByRole('navigation', { name: '主要導覽' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
    fireEvent.click(screen.getByRole('button', { name: '返回我的書架' }))

    expect(screen.getByRole('button', { name: '我的書架' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(screen.getByRole('region', { name: '最近閱讀' })).getByText(
        '潮汐之城',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '書城' }))
    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '霜劍' },
    })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '我的書架' }))

    shelf = screen.getByRole('region', { name: '我的書架' })
    expect(within(shelf).getByText('潮汐之城')).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: '最近閱讀' })).getByText(
        '潮汐之城',
      ),
    ).toBeInTheDocument()
  })
})

describe('Readable Depth Presentation V1 integration', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('displays accurate readable depth on Catalog cards and editorial shelf for live Wave 5 books', () => {
    render(<App dependencies={createDependencies()} />)

    // Wave 5 books in catalog results region
    const resultsRegion = screen.getByRole('region', { name: '探索更多故事' })
    const tideArchiveCard = within(resultsRegion).getByRole('heading', { level: 3, name: '潮汐檔案' }).closest('article')
    const emberCrownCard = within(resultsRegion).getByRole('heading', { level: 3, name: '餘燼王冠' }).closest('article')
    const orbitLightCard = within(resultsRegion).getByRole('heading', { level: 3, name: '軌道盡頭的微光' }).closest('article')
    const tideCityCard = within(resultsRegion).getByRole('heading', { level: 3, name: '潮汐之城' }).closest('article')

    expect(tideArchiveCard).not.toBeNull()
    expect(emberCrownCard).not.toBeNull()
    expect(orbitLightCard).not.toBeNull()
    expect(tideCityCard).not.toBeNull()

    expect(within(tideArchiveCard as HTMLElement).getByText('10 章可讀')).toBeInTheDocument()
    expect(within(emberCrownCard as HTMLElement).getByText('9 章可讀')).toBeInTheDocument()
    expect(within(orbitLightCard as HTMLElement).getByText('9 章可讀')).toBeInTheDocument()
    expect(within(tideCityCard as HTMLElement).getByText('13 章可讀')).toBeInTheDocument()

    // Editorial shelf
    const editorialShelf = screen.getByRole('region', { name: '編輯精選' })
    expect(within(editorialShelf).getByText('林澄 · 13 章可讀')).toBeInTheDocument()
    expect(within(editorialShelf).getByText('沈墨白 · 13 章可讀')).toBeInTheDocument()
    expect(within(editorialShelf).getByText('韓亦晴 · 8 章可讀')).toBeInTheDocument()
  })


  it('displays distinct total vs readable chapters and depth summary in Book Detail for Wave 5 book', () => {
    render(<App dependencies={createDependencies()} />)

    // Filter to 潮汐檔案 and open detail
    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '潮汐檔案' },
    })

    fireEvent.click(screen.getByRole('button', { name: '查看書籍' }))

    expect(screen.getByRole('heading', { level: 1, name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getByText('章節', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('可閱讀', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getAllByText('10 章', { selector: 'dd' })).toHaveLength(2)
    expect(screen.getByText('目前 10 章皆可閱讀')).toBeInTheDocument()

    // Start reading still works
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))
    expect(screen.getByRole('heading', { name: '沉入海底的鐘' })).toBeInTheDocument()
  })


  it('displays accurate depth summary and facts for partial-access book in repository', () => {
    const { repository } = createAccessStatusRepository()

    render(
      <App
        dependencies={{
          contentRepository: repository,
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
        }}
      />,
    )

    // In access status repository: 4 chapters total, 2 openable (c1 READABLE, c2 PREVIEW, c3 LOCKED, c4 UNAVAILABLE)
    const card = screen.getByRole('article')
    expect(within(card).getByText('可讀 2 / 4 章')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看書籍' }))

    expect(screen.getByText('章節', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('4 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('可閱讀', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByText('2 章', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByText('目前可連續閱讀前 2 章')).toBeInTheDocument()
  })

  it('navigates Wave 6 Tide City mobile reading journey through Ch8 continuation into Ch9 and verifies TOC', () => {
    render(<App dependencies={createDependencies()} />)

    // Catalog -> locate 《潮汐之城》
    const resultsRegion = screen.getByRole('region', { name: '探索更多故事' })
    const tideCityCard = within(resultsRegion).getByRole('heading', { level: 3, name: '潮汐之城' }).closest('article')
    expect(tideCityCard).not.toBeNull()
    expect(within(tideCityCard as HTMLElement).getByText('13 章可讀')).toBeInTheDocument()

    // Open Book Detail
    openBookDetail()
    expect(screen.getByRole('heading', { level: 1, name: '潮汐之城' })).toBeInTheDocument()
    expect(screen.getByText('共 13 章')).toBeInTheDocument()
    expect(screen.getByText('目前 13 章皆可閱讀')).toBeInTheDocument()

    // Open Chapter 8 from chapter list
    const chapterList = screen.getByRole('list', { name: '章節預覽列表' })
    const ch8Item = within(chapterList).getByText('第八章：可回頭的潮聲').closest('li')
    expect(ch8Item).not.toBeNull()
    fireEvent.click(within(ch8Item as HTMLElement).getByRole('button'))

    // In Reader at Chapter 8
    expect(screen.getByRole('heading', { name: '第八章：可回頭的潮聲' })).toBeInTheDocument()

    // Chapter-end continuation surface displays real Chapter 9 title
    const chapterEndSurface = screen.getByTestId('chapter-end-surface')
    const continueBtn = within(chapterEndSurface).getByRole('button', {
      name: '繼續閱讀：第九章：離岸燈站調查',
    })
    expect(continueBtn).toBeInTheDocument()

    // Continue opens Chapter 9 with substantive prose
    fireEvent.click(continueBtn)
    expect(screen.getByRole('heading', { name: '第九章：離岸燈站調查' })).toBeInTheDocument()
    expect(screen.getByText(/清晨退潮時，遠海那一聲微弱的潮響在澄夏的右耳邊逐漸散開/)).toBeInTheDocument()

    // TOC shows Ch9–13 READABLE
    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    const dialog = screen.getByRole('dialog', { name: '章節目錄' })
    for (const title of [
      '第九章：離岸燈站調查',
      '第十章：撤照檔案',
      '第十一章：拒絕的浪',
      '第十二章：受限可讀',
      '第十三章：離岸燈的答案',
    ]) {
      const btn = within(dialog).getByText(title).closest('button') as HTMLButtonElement
      expect(btn).not.toBeNull()
      expect(btn).not.toBeDisabled()
      expect(within(btn.closest('li') as HTMLElement).queryByText('已鎖定')).not.toBeInTheDocument()
      expect(within(btn.closest('li') as HTMLElement).queryByText('暫不可用')).not.toBeInTheDocument()
    }
  })
})
