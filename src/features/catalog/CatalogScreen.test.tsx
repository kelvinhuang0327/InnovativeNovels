import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { CatalogScreen } from './CatalogScreen'

function makeBook(
  id: string,
  title: string,
  categoryLabel: string,
  description: string,
  authorName = '作者',
): ContentBook {
  return {
    book: { id: bookId(id), title, authorName, categoryLabel },
    description,
    chapters: [
      {
        id: chapterId(`${id}-c1`),
        bookId: bookId(id),
        title: '第一章',
        sequence: chapterSequence(1),
        access: CHAPTER_ACCESS.READABLE,
      },
    ],
  }
}

const books: readonly ContentBook[] = [
  makeBook('book-a', '海邊書店', '懸疑', '一間書店裡的秘密。', '沈墨'),
  makeBook('book-b', '山中劍客', '仙俠', '劍與修行的故事。', '岑海'),
  makeBook('book-c', '城市夜歸人', '都市', '深夜的都市告白故事。', '林晚'),
  makeBook('book-d', '雨中告白', '言情', '一段遲來的告白。', 'Wendy Lai'),
]

describe('CatalogScreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders exactly four books with a 全部 option and every represented genre', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('button', { name: '全部' })).toBeInTheDocument()
    for (const genre of ['懸疑', '仙俠', '都市', '言情']) {
      expect(screen.getByRole('button', { name: genre })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('共 4 本')).toBeInTheDocument()
  })

  it('opens the deterministic first book from the bookstore hero action', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '閱讀焦點作品' }))

    expect(onOpenBook).toHaveBeenCalledWith('book-a')
  })

  it('exposes a clear Bookstore to Library navigation action', () => {
    const onOpenLibrary = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
        onOpenLibrary={onOpenLibrary}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '我的書架' }))

    expect(onOpenLibrary).toHaveBeenCalledOnce()
  })

  it('keeps every input book reachable through its card action', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    screen
      .getAllByRole('button', { name: '查看書籍' })
      .forEach((button) => fireEvent.click(button))

    expect(onOpenBook.mock.calls).toEqual([
      ['book-a'],
      ['book-b'],
      ['book-c'],
      ['book-d'],
    ])
  })

  it('renders Continue Reading only when entries exist and preserves its action', () => {
    const onContinueBook = vi.fn()
    const chapter = books[0].chapters[0]
    const continueEntry: ContinueReadingEntry = {
      book: books[0],
      chapter,
      position: {
        bookId: books[0].book.id,
        chapterId: chapter.id,
        paragraphIndex: 0,
        chapterProgress: 0,
      },
    }

    const emptyShelf = render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={onContinueBook}
        onOpenBook={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('heading', { name: '繼續閱讀' }),
    ).not.toBeInTheDocument()
    emptyShelf.unmount()

    render(
      <CatalogScreen
        books={books}
        continueReading={[continueEntry]}
        onContinueBook={onContinueBook}
        onOpenBook={vi.fn()}
      />,
    )

    const shelf = screen.getByRole('region', { name: '繼續閱讀' })
    expect(shelf).toHaveTextContent('海邊書店')
    expect(shelf).toHaveTextContent('第一章')
    fireEvent.click(within(shelf).getByRole('button', { name: '繼續閱讀' }))

    expect(onContinueBook).toHaveBeenCalledWith('book-a')
  })

  it('filters to matching books when a genre is selected', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '仙俠' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '仙俠' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('找到 1 本')).toBeInTheDocument()
  })

  it('matches search text against the title', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
  })

  it('matches search text against the author', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '岑海' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()
  })

  it('matches Latin author names case-insensitively', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: 'wendy' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('雨中告白')).toBeInTheDocument()
  })

  it('trims whitespace-only and surrounding-whitespace search input', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '  劍客  ' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('山中劍客')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '   ' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(4)
  })

  it('matches search text against the description', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '告白' },
    })

    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('combines search and genre filter by intersection', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '告白' },
    })
    fireEvent.click(screen.getByRole('button', { name: '言情' }))

    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByText('雨中告白')).toBeInTheDocument()
    expect(screen.getByText('找到 1 本')).toBeInTheDocument()
  })

  it('shows an accessible empty state with a reset action for a query that matches nothing', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '不存在的關鍵字' },
    })

    expect(screen.queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      '找不到符合條件的小說',
    )
    expect(screen.getByText('找到 0 本')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '清除篩選' }),
    ).toBeInTheDocument()
  })

  it('clears search and genre filter back to all books', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })
    fireEvent.click(screen.getByRole('button', { name: '仙俠' }))
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.getByLabelText('搜尋小說')).toHaveValue('')
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByText('共 4 本')).toBeInTheDocument()
  })

  it('resets from the empty state back to the full catalog', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '不存在的關鍵字' },
    })
    fireEvent.click(screen.getByRole('button', { name: '清除篩選' }))

    expect(screen.getAllByRole('article')).toHaveLength(4)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('preserves stable Book IDs through the onOpenBook callback', () => {
    const onOpenBook = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={onOpenBook}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[1])

    expect(onOpenBook).toHaveBeenCalledWith('book-b')
  })

  it('hides editorial discovery while filtered so results remain authoritative', () => {
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '編輯精選' }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜尋小說'), {
      target: { value: '劍客' },
    })

    expect(
      screen.queryByRole('heading', { name: '編輯精選' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '篩選結果' }),
    ).toBeInTheDocument()
  })

  it('keeps Authoring secondary when supplied and absent when unavailable', () => {
    const onOpenAuthoring = vi.fn()
    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenAuthoring={onOpenAuthoring}
        onOpenBook={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '開啟創作預覽' }))
    expect(onOpenAuthoring).toHaveBeenCalledOnce()
    cleanup()

    render(
      <CatalogScreen
        books={books}
        continueReading={[]}
        onContinueBook={vi.fn()}
        onOpenBook={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: '開啟創作預覽' }),
    ).not.toBeInTheDocument()
  })
})
