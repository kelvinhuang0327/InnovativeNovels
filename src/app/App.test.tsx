import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import {
  ACTIVE_READER_SESSION_STORAGE_KEY,
  LocalStorageActiveReaderSessionRepository,
} from '../infrastructure/persistence/localStorageActiveReaderSessionRepository'
import {
  LocalStorageChapterBookmarksRepository,
  CHAPTER_BOOKMARKS_STORAGE_KEY,
} from '../infrastructure/persistence/localStorageChapterBookmarksRepository'
import {
  LocalStorageReaderPreferencesRepository,
  READER_PREFERENCES_STORAGE_KEY,
} from '../infrastructure/persistence/localStorageReaderPreferencesRepository'
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
    expect(screen.getByText('共 3 章')).toBeInTheDocument()
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
    expect(screen.getAllByTestId('chapter-prose')).toHaveLength(2)

    expect(
      JSON.parse(
        window.localStorage.getItem(READING_STATE_STORAGE_KEY) ?? '',
      ),
    ).toEqual({
      schemaVersion: 1,
      positions: {
        'book-tide-city': {
          bookId: 'book-tide-city',
          chapterId: 'chapter-tide-letter',
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

  it('navigates by explicit sequence without requesting or rendering locked prose', () => {
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
      within(reader).getByText('本章尚未開放，沒有載入任何內文。'),
    ).toBeInTheDocument()
    expect(within(reader).queryAllByTestId('chapter-prose')).toHaveLength(0)
    expect(proseRequest).toHaveBeenCalledTimes(2)
    expect(proseRequest).not.toHaveBeenCalledWith('chapter-sealed-gate')
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

  it('renders exactly four books in the catalog', () => {
    render(<App dependencies={createDependencies()} />)

    expect(screen.getAllByRole('article')).toHaveLength(4)
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
    expect(screen.getAllByRole('article')).toHaveLength(4)
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
    { bookIndex: 0, lockedHeading: '第三章：封印之門', lockedChapterId: 'chapter-sealed-gate' },
    { bookIndex: 1, lockedHeading: '第三章：仙途劫', lockedChapterId: 'chapter-immortal-tribulation' },
    { bookIndex: 2, lockedHeading: '第三章：茶水間的真相', lockedChapterId: 'chapter-break-room-truth' },
    { bookIndex: 3, lockedHeading: '第三章：重逢之後', lockedChapterId: 'chapter-after-reunion' },
  ])(
    'renders zero prose and never requests content for the locked chapter of book index $bookIndex',
    ({ bookIndex, lockedHeading, lockedChapterId }) => {
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
        within(reader).getByRole('heading', { name: lockedHeading }),
      ).toBeInTheDocument()
      expect(within(reader).queryAllByTestId('chapter-prose')).toHaveLength(0)
      expect(proseRequest).toHaveBeenCalledTimes(2)
      expect(proseRequest).not.toHaveBeenCalledWith(lockedChapterId)
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

    fireEvent.click(screen.getByRole('radio', { name: '大' }))
    fireEvent.click(screen.getByRole('radio', { name: '寬鬆' }))
    fireEvent.click(screen.getByRole('radio', { name: '護眼' }))

    const savedPrefs = JSON.parse(
      window.localStorage.getItem(READER_PREFERENCES_STORAGE_KEY) ?? '',
    )
    expect(savedPrefs).toEqual({
      schemaVersion: 1,
      fontScale: 'large',
      lineSpacing: 'spacious',
      theme: 'sepia',
    })

    firstMount.unmount()

    // The active reader session marker (Wave 4) means an un-exited remount
    // recovers straight back into Reader; no need to navigate through Book
    // Detail again to reach it.
    render(<App dependencies={createDependencies()} />)

    const section = screen.getByLabelText('閱讀器')
    expect(section.getAttribute('data-theme')).toBe('sepia')
    expect(section.getAttribute('data-font-scale')).toBe('large')
    expect(section.getAttribute('data-line-spacing')).toBe('spacious')

    fireEvent.click(screen.getByRole('button', { name: '重設預設值' }))
    expect(section.getAttribute('data-theme')).toBe('light')
    expect(section.getAttribute('data-font-scale')).toBe('medium')
    expect(section.getAttribute('data-line-spacing')).toBe('comfortable')
  })

  it('handles preference changes without altering ReadingPosition', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    const initialPos = window.localStorage.getItem(READING_STATE_STORAGE_KEY)
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

  it('prevents bookmarking locked chapters and does not render bookmark button on locked chapters', () => {
    render(<App dependencies={createDependencies()} />)
    openFirstBookReader()

    // Chapter 1 -> Chapter 2 -> Chapter 3 (Locked)
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])

    expect(
      screen.getByRole('heading', { name: '第三章：封印之門' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '加入章節書籤' }),
    ).not.toBeInTheDocument()
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
    ])

    expect(items[0].querySelector('button')?.getAttribute('aria-current')).toBe(
      'true',
    )
    expect(items[1].querySelector('button')?.getAttribute('aria-current')).toBeNull()
  })

  it('disables the locked chapter in the TOC and never requests its prose', () => {
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
    const lockedButton = tocButtonFor('第三章：封印之門')
    expect(lockedButton).toBeDisabled()

    fireEvent.click(lockedButton)
    expect(proseRequest).not.toHaveBeenCalledWith('chapter-sealed-gate')
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
      schemaVersion: 1,
      positions: {
        'book-tide-city': {
          bookId: 'book-tide-city',
          chapterId: 'chapter-lighthouse-watch',
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

    expect(progress()).toHaveTextContent('第 1 / 3 章')
    expect(progress().textContent).not.toMatch(/%|頁|段落/)
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    // Bookmark chapter 1 so it can be reached again via the bookmarks modal.
    fireEvent.click(screen.getByRole('button', { name: '加入章節書籤' }))

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 3 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 3 / 3 章')
    expect(
      screen.queryByRole('progressbar', { name: '本章閱讀進度' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: '上一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 3 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getByRole('button', { name: '開啟章節目錄' }))
    fireEvent.click(tocButtonFor('第一章：潮聲來信'))
    expect(progress()).toHaveTextContent('第 1 / 3 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')

    fireEvent.click(screen.getAllByRole('button', { name: '下一章' })[0])
    expect(progress()).toHaveTextContent('第 2 / 3 章')

    fireEvent.click(screen.getByRole('button', { name: '開啟書籤列表' }))
    const bookmarksDialog = screen.getByRole('dialog', { name: '章節書籤' })
    fireEvent.click(
      within(bookmarksDialog).getByRole('button', { name: '移至章節' }),
    )
    expect(progress()).toHaveTextContent('第 1 / 3 章')
    expect(liveProgress()).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('Persistent reader chapter navigation integrated journey', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  function openFirstBookReader() {
    render(<App dependencies={createDependencies()} />)
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
    expect(screen.getByRole('progressbar', { name: '目前章節位置' })).toHaveTextContent('第 2 / 3 章')
    expect(within(persistentNav).getByText('第 2 / 3 章')).toBeInTheDocument()
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

    // Click persistent Next button to go to Chapter 3 (第三章：封印之門, which is locked)
    fireEvent.click(persistentNext)
    expect(screen.getByRole('heading', { name: '第三章：封印之門' })).toBeInTheDocument()
    expect(screen.getByText('本章尚未開放，沒有載入任何內文。')).toBeInTheDocument()
    expect(persistentNext).toBeDisabled()
    expect(persistentPrev).not.toBeDisabled()

    // Click persistent Previous button to return to Chapter 2
    fireEvent.click(persistentPrev)
    expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
    expect(persistentNext).not.toBeDisabled()
    expect(persistentPrev).not.toBeDisabled()
  })



  it('preserves reader preferences across persistent navigation', () => {
    openFirstBookReader()

    // Change theme to sepia (護眼) and font scale to large (大)
    fireEvent.click(screen.getByRole('radio', { name: '護眼' }))
    fireEvent.click(screen.getByRole('radio', { name: '大' }))

    const section = screen.getByRole('region', { name: '閱讀器' })
    expect(section).toHaveAttribute('data-theme', 'sepia')
    expect(section).toHaveAttribute('data-font-scale', 'large')

    // Navigate to next chapter via persistent nav
    const persistentNav = screen.getByTestId('reader-persistent-navigation')
    fireEvent.click(within(persistentNav).getByRole('button', { name: '下一章' }))

    // Preferences should remain intact
    expect(section).toHaveAttribute('data-theme', 'sepia')
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
      const persistentNav = screen.getByTestId('reader-persistent-navigation')
      fireEvent.click(within(persistentNav).getByRole('button', { name: '下一章' }))
      fireEvent.click(screen.getByRole('button', { name: '返回作品' }))

      // Re-open through Book Detail Continue CTA
      fireEvent.click(screen.getByRole('button', { name: '繼續閱讀：第二章：燈塔守望' }))
      expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()

      // Exit back to Book Detail -> Return to Catalog -> Open from Continue Shelf
      fireEvent.click(screen.getByRole('button', { name: '返回作品' }))
      fireEvent.click(screen.getByRole('button', { name: '返回書庫' }))

      const shelf = screen.getByRole('region', { name: '繼續閱讀' })
      expect(within(shelf).getByText('第二章：燈塔守望')).toBeInTheDocument()

      fireEvent.click(within(shelf).getByRole('button', { name: '繼續閱讀' }))
      expect(screen.getByRole('heading', { name: '第二章：燈塔守望' })).toBeInTheDocument()
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
    expect(screen.getAllByRole('article')).toHaveLength(4)
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

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(rawMarker()).toBeNull()
  })

  it('falls back to safe Catalog startup and clears a marker naming an unknown BookId', () => {
    window.localStorage.setItem(
      ACTIVE_READER_SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, activeBookId: 'book-does-not-exist' }),
    )

    render(<App dependencies={createDependencies()} />)

    expect(screen.getAllByRole('article')).toHaveLength(4)
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

