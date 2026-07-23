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
    fireEvent.click(screen.getByRole('button', { name: '下一章' }))

    expect(
      screen.getByRole('heading', { name: '第二章：燈塔守望' }),
    ).toBeInTheDocument()
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    openBookDetail()
    fireEvent.click(screen.getByRole('button', { name: '繼續閱讀' }))

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
    fireEvent.click(screen.getByRole('button', { name: '下一章' }))
    fireEvent.click(screen.getByRole('button', { name: '下一章' }))

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
    fireEvent.click(screen.getByRole('button', { name: '返回書籍' }))
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
    fireEvent.click(screen.getByRole('button', { name: '下一章' }))
    expect(
      screen.getByRole('heading', { name: '第二章：入山門' }),
    ).toBeInTheDocument()
    firstMount.unmount()

    render(<App dependencies={createDependencies()} />)
    openBookAt(1)
    fireEvent.click(screen.getByRole('button', { name: '繼續閱讀' }))

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
    fireEvent.click(screen.getByRole('button', { name: '下一章' }))
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
      fireEvent.click(screen.getByRole('button', { name: '下一章' }))
      fireEvent.click(screen.getByRole('button', { name: '下一章' }))

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
