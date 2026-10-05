import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BookTextSearchResult } from '../../application/reading/readingUseCases'
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import {
  DEFAULT_READER_PREFERENCES,
  type ReaderPreferences,
} from '../../domain/reading/readerPreferences'
import { ReaderScreen } from './ReaderScreen'

const originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
)
const originalSpeechSynthesisDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'speechSynthesis',
)
const originalSpeechSynthesisUtteranceDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'SpeechSynthesisUtterance',
)

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  if (originalScrollIntoViewDescriptor) {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoViewDescriptor,
    )
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
  }

  if (originalSpeechSynthesisDescriptor) {
    Object.defineProperty(
      window,
      'speechSynthesis',
      originalSpeechSynthesisDescriptor,
    )
  } else {
    Reflect.deleteProperty(window, 'speechSynthesis')
  }

  if (originalSpeechSynthesisUtteranceDescriptor) {
    Object.defineProperty(
      window,
      'SpeechSynthesisUtterance',
      originalSpeechSynthesisUtteranceDescriptor,
    )
  } else {
    Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
  }
})

const mockBook = {
  book: {
    id: bookId('b1'),
    title: 'Book One',
    authorName: 'Author',
    categoryLabel: 'Fiction',
  },
  description: 'Desc',
  chapters: [
    {
      id: chapterId('c1'),
      bookId: bookId('b1'),
      title: 'Chapter 1',
      sequence: chapterSequence(1),
      access: CHAPTER_ACCESS.READABLE,
    },
  ],
}

const mockOpenedChapter = {
  book: mockBook,
  chapter: mockBook.chapters[0],
  prose: ['Paragraph 1'],
  isLocked: false,
  hasPrevious: false,
  hasNext: true,
  initialChapterProgress: 0,
}

const mockTableOfContents = [
  {
    chapterId: mockBook.chapters[0].id,
    title: mockBook.chapters[0].title,
    sequence: mockBook.chapters[0].sequence,
    isAccessible: true,
    isCurrent: true,
  },
]

const mockChapterPosition = { currentPosition: 1, totalChapters: 1 }

const mockBookTextSearchResult: BookTextSearchResult = {
  chapterId: chapterId('c2'),
  chapterTitle: 'Chapter 2',
  chapterSequence: chapterSequence(2),
  paragraphIndex: 1,
  paragraphText: 'The hidden target appears twice, target.',
  matchIndex: 'The hidden target appears twice, target.'.indexOf('target'),
}

describe('ReaderScreen Comfort & Bookmarks UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('applies preference state tokens to container and prose', () => {
    const preferences = {
      fontFamily: 'serif' as const,
      fontScale: 'large' as const,
      letterSpacing: 'relaxed' as const,
      lineSpacing: 'spacious' as const,
      readingMode: 'continuous' as const,
      theme: 'sepia' as const,
    }

    const { container } = render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={preferences}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const section = container.querySelector('section')
    expect(section?.getAttribute('data-theme')).toBe('sepia')
    expect(section?.getAttribute('data-font-family')).toBe('serif')
    expect(section?.getAttribute('data-font-scale')).toBe('large')
    expect(section?.getAttribute('data-letter-spacing')).toBe('relaxed')
    expect(section?.getAttribute('data-line-spacing')).toBe('spacious')
    expect(section?.getAttribute('data-reading-mode')).toBe('continuous')

    const prose = container.querySelector('.reader-prose')
    expect(prose?.className).toContain('theme-sepia')
    expect(prose?.className).toContain('font-family-serif')
    expect(prose?.className).toContain('font-scale-large')
    expect(prose?.className).toContain('letter-spacing-relaxed')
    expect(prose?.className).toContain('line-spacing-spacious')
  })

  it('triggers preference changes and reset', () => {
    const onChangePreferences = vi.fn()
    const onResetPreferences = vi.fn()

    render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={onChangePreferences}
        onResetPreferences={onResetPreferences}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const appearanceTrigger = screen.getByRole('button', { name: '閱讀設定' })
    expect(
      screen.queryByRole('dialog', { name: '閱讀設定' }),
    ).not.toBeInTheDocument()

    fireEvent.click(appearanceTrigger)
    const appearanceSheet = screen.getByRole('dialog', { name: '閱讀設定' })
    expect(appearanceTrigger).toHaveAttribute('aria-expanded', 'true')

    const darkThemeButton = screen.getByRole('radio', { name: '暗黑' })
    fireEvent.click(darkThemeButton)
    expect(onChangePreferences).toHaveBeenCalledWith({
      ...DEFAULT_READER_PREFERENCES,
      theme: 'dark',
    })

    const resetButton = screen.getByRole('button', { name: '重設預設值' })
    fireEvent.click(resetButton)
    expect(onResetPreferences).toHaveBeenCalled()

    fireEvent.keyDown(appearanceSheet, { key: 'Escape' })
    expect(
      screen.queryByRole('dialog', { name: '閱讀設定' }),
    ).not.toBeInTheDocument()
    expect(appearanceTrigger).toHaveFocus()
  })

  it('displays bookmark button and handles toggle and modal opening', () => {
    const onToggleBookmark = vi.fn()

    render(
      <ReaderScreen
        openedChapter={mockOpenedChapter}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={vi.fn()}
        onResetPreferences={vi.fn()}
        onToggleBookmark={onToggleBookmark}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />,
    )

    const bookmarkButton = screen.getByRole('button', { name: '加入章節書籤' })
    fireEvent.click(bookmarkButton)
    expect(onToggleBookmark).toHaveBeenCalled()

    const openBookmarksButton = screen.getByRole('button', {
      name: '開啟書籤列表',
    })
    expect(openBookmarksButton).toHaveAttribute('aria-haspopup', 'dialog')
    expect(openBookmarksButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(openBookmarksButton)

    const bookmarksDialog = screen.getByRole('dialog', { name: '章節書籤' })
    expect(bookmarksDialog).toBeInTheDocument()
    expect(bookmarksDialog).toHaveFocus()
    expect(openBookmarksButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('尚無書籤')).toBeInTheDocument()

    fireEvent.click(
      within(bookmarksDialog).getByRole('button', { name: '關閉書籤' }),
    )

    expect(openBookmarksButton).toHaveAttribute('aria-expanded', 'false')
    expect(openBookmarksButton).toHaveFocus()
  })
})

describe('Reader speech controls', () => {
  afterEach(() => {
    cleanup()
  })

  function installSpeechRuntime({
    includeSynthesis = true,
    includeUtterance = true,
  }: {
    readonly includeSynthesis?: boolean
    readonly includeUtterance?: boolean
  } = {}) {
    const events: string[] = []
    const utterances: TestSpeechSynthesisUtterance[] = []

    class TestSpeechSynthesisUtterance {
      readonly text: string
      rate = 1
      onend: SpeechSynthesisUtterance['onend'] = null
      onerror: SpeechSynthesisUtterance['onerror'] = null

      constructor(text = '') {
        this.text = text
        utterances.push(this)
        events.push(`construct:${text}`)
      }
    }

    const speechSynthesis = {
      cancel: vi.fn(() => events.push('cancel')),
      pause: vi.fn(() => events.push('pause')),
      resume: vi.fn(() => events.push('resume')),
      speak: vi.fn((utterance: SpeechSynthesisUtterance) => {
        events.push(
          `speak:${(utterance as TestSpeechSynthesisUtterance).text}`,
        )
      }),
    } as unknown as SpeechSynthesis

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: includeSynthesis ? speechSynthesis : undefined,
    })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: includeUtterance ? TestSpeechSynthesisUtterance : undefined,
    })

    return { events, speechSynthesis, utterances }
  }

  function readerForSpeech(
    openedChapter = mockOpenedChapter,
    chapterOpenFailed = false,
    onChangePreferences: (newPreferences: ReaderPreferences) => void = vi.fn(),
  ) {
    return (
      <ReaderScreen
        openedChapter={openedChapter}
        chapterOpenFailed={chapterOpenFailed}
        preferences={DEFAULT_READER_PREFERENCES}
        isBookmarked={false}
        bookmarks={[]}
        tableOfContents={mockTableOfContents}
        chapterPosition={mockChapterPosition}
        onChangePreferences={onChangePreferences}
        onResetPreferences={vi.fn()}
        onToggleBookmark={vi.fn()}
        onSelectBookmark={vi.fn()}
        onRemoveBookmark={vi.fn()}
        onSelectChapter={vi.fn()}
        onBackToBook={vi.fn()}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
      />
    )
  }

  it.each([
    ['speechSynthesis', { includeSynthesis: false }],
    ['SpeechSynthesisUtterance', { includeUtterance: false }],
  ])('requires %s to offer speech controls', (_missingApi, runtimeOptions) => {
    installSpeechRuntime(runtimeOptions)

    render(readerForSpeech())

    expect(
      screen.queryByRole('button', { name: '開始朗讀' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('combobox', { name: '朗讀速度' }),
    ).not.toBeInTheDocument()
  })

  it('cancels existing speech, then speaks each paragraph in order and can stop', () => {
    const speech = installSpeechRuntime()
    const openedChapter = {
      ...mockOpenedChapter,
      prose: ['第一段內文', '第二段內文'],
    }

    render(readerForSpeech(openedChapter))
    fireEvent.click(screen.getByRole('button', { name: '開始朗讀' }))

    expect(speech.events).toEqual([
      'cancel',
      'construct:第一段內文',
      'construct:第二段內文',
      'speak:第一段內文',
      'speak:第二段內文',
    ])
    expect(speech.utterances.map((utterance) => utterance.rate)).toEqual([1, 1])
    expect(screen.getByRole('button', { name: '停止朗讀' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '停止朗讀' }))

    expect(speech.speechSynthesis.cancel).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '開始朗讀' })).toBeInTheDocument()
  })

