import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  BookmarkEntry,
  BookTextSearchResult,
  ChapterPositionProgress,
  OpenedChapter,
  TableOfContentsEntry,
} from '../../application/reading/readingUseCases'
import { calculateReadingProgress } from '../../domain/reading/readingProgressPolicy'
import type { ReadingPosition } from '../../domain/reading/readingPosition'
import type { ReaderPreferences } from '../../domain/reading/readerPreferences'
import { BookTextSearchModal } from './BookTextSearchModal'
import { ChapterBookmarksModal } from './ChapterBookmarksModal'
import { ChapterReadingNoteModal } from './ChapterReadingNoteModal'
import { ReaderAppearanceSheet } from './ReaderAppearanceSheet'
import { TableOfContentsModal } from './TableOfContentsModal'

const CHAPTER_SWIPE_MIN_DISTANCE_PX = 72
const CHAPTER_SWIPE_HORIZONTAL_DOMINANCE_RATIO = 1.5
const CHROME_HIDE_SCROLL_THRESHOLD_PX = 56
const CHROME_REVEAL_SCROLL_THRESHOLD_PX = 24
const CHROME_TAP_MAX_MOVEMENT_PX = 10
const MOBILE_READER_CHROME_MAX_WIDTH_PX = 768
const MOBILE_READER_CHROME_MEDIA_QUERY = `(max-width: ${MOBILE_READER_CHROME_MAX_WIDTH_PX}px)`
const SWIPE_EXCLUDED_TARGETS =
  'a, button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="dialog"]'
const CHROME_TOGGLE_EXCLUDED_TARGETS = `${SWIPE_EXCLUDED_TARGETS}, dialog, [role="menu"], [role="listbox"]`
const READER_SPEECH_RATES = [0.75, 1, 1.25, 1.5] as const

interface ReaderSpeechRuntime extends Window {
  readonly SpeechSynthesisUtterance?: new (
    text?: string,
  ) => SpeechSynthesisUtterance
}

function getReaderSpeechRuntime():
  | {
      readonly speechSynthesis: SpeechSynthesis
      readonly SpeechSynthesisUtterance: new (
        text?: string,
      ) => SpeechSynthesisUtterance
    }
  | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const speechWindow = window as ReaderSpeechRuntime
  const speechSynthesis = speechWindow.speechSynthesis
  const SpeechSynthesisUtterance = speechWindow.SpeechSynthesisUtterance

  if (
    !speechSynthesis ||
    typeof SpeechSynthesisUtterance !== 'function'
  ) {
    return undefined
  }

  return { speechSynthesis, SpeechSynthesisUtterance }
}

interface ReaderSwipeGesture {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
}

interface PagedReaderState {
  readonly chapterId: string
  readonly pageIndex: number
  readonly pageCount: number
}

interface LiveProgress {
  readonly chapterId: string
  readonly percent: number
  readonly bookPercent: number | undefined
}

interface PagedReaderMetrics {
  readonly pageCount: number
  readonly pageStep: number
}

function isSwipeExcludedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SWIPE_EXCLUDED_TARGETS) !== null
}

function isChromeToggleExcludedTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(CHROME_TOGGLE_EXCLUDED_TARGETS) !== null
  )
}

function isReaderKeyboardShortcutEditableTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Element)) {
    return false
  }

  if (
    target.closest(
      'input, textarea, select, [role="textbox"], [role="searchbox"]',
    )
  ) {
    return true
  }

  const contentEditableTarget = target.closest('[contenteditable]')
  return (
    contentEditableTarget !== null &&
    contentEditableTarget.getAttribute('contenteditable')?.toLowerCase() !==
      'false'
  )
}

function subscribeToMobileReaderChrome(onStoreChange: () => void) {
  if (typeof window.matchMedia !== 'function') {
    return () => {}
  }

  const mediaQueryList = window.matchMedia(MOBILE_READER_CHROME_MEDIA_QUERY)

  if (typeof mediaQueryList.addEventListener === 'function') {
    mediaQueryList.addEventListener('change', onStoreChange)
    return () => {
      mediaQueryList.removeEventListener('change', onStoreChange)
    }
  }

  mediaQueryList.addListener(onStoreChange)
  return () => {
    mediaQueryList.removeListener(onStoreChange)
  }
}

function getMobileReaderChromeSnapshot() {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_READER_CHROME_MEDIA_QUERY).matches
    : false
}

function normalizedPageProgress(pageIndex: number, pageCount: number): number {
  return pageCount > 1 ? pageIndex / (pageCount - 1) : 0
}

function clampChapterProgress(chapterProgress: number): number {
  return Number.isFinite(chapterProgress)
    ? Math.min(Math.max(chapterProgress, 0), 1)
    : 0
}

function roundedProgressPercent(
  position: ReadingPosition,
  chapterSequence: number,
  totalChapters: number,
): number | undefined {
  const progress = calculateReadingProgress({
    position,
    chapterSequence,
    totalChapters,
  })

  return progress.valid ? Math.round(progress.percent) : undefined
}

interface ReaderScreenProps {
  readonly openedChapter: OpenedChapter
  readonly recoveryStatus?: string
  readonly chapterOpenFailed?: boolean
  readonly preferences: ReaderPreferences
  readonly isPersistentStorageAvailable?: boolean
  readonly isBookmarked: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly tableOfContents: readonly TableOfContentsEntry[]
  readonly chapterPosition: ChapterPositionProgress | undefined
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
  readonly onToggleBookmark: () => void
  readonly onSelectBookmark: (position: ReadingPosition) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly loadChapterReadingNote?: () => string
  readonly onSaveChapterReadingNote?: (content: string) => void
  readonly onSelectChapter: (chapterId: string) => void
  readonly searchBookText?: (query: string) => readonly BookTextSearchResult[]
  readonly onSelectBookTextSearchResult?: (
    result: BookTextSearchResult,
  ) => void
  readonly searchTargetParagraphIndex?: number
  readonly onBackToBook: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onRetryChapterOpen?: () => void
  readonly canNavigateNextChapter?: boolean
  readonly onProgressChange?: (chapterProgress: number) => void
}

export function ReaderScreen({
  openedChapter,
  recoveryStatus,
  chapterOpenFailed = false,
  preferences,
  isPersistentStorageAvailable = true,
  isBookmarked,
  bookmarks,
  tableOfContents,
  chapterPosition,
  onChangePreferences,
  onResetPreferences,
  onToggleBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  loadChapterReadingNote = () => '',
  onSaveChapterReadingNote = () => {},
  onSelectChapter,
  searchBookText,
  onSelectBookTextSearchResult,
  searchTargetParagraphIndex,
  onBackToBook,
  onPrevious,
  onNext,
  onRetryChapterOpen,
  canNavigateNextChapter = false,
  onProgressChange,
}: ReaderScreenProps) {
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [isChapterReadingNoteOpen, setIsChapterReadingNoteOpen] =
    useState(false)
  const [chapterReadingNoteContent, setChapterReadingNoteContent] =
    useState('')
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [isBookTextSearchOpen, setIsBookTextSearchOpen] = useState(false)
  const [isReaderChromeVisible, setIsReaderChromeVisible] = useState(true)
  const [speakingChapterId, setSpeakingChapterId] = useState<string | null>(
    null,
  )
  const [pausedChapterId, setPausedChapterId] = useState<string | null>(null)
