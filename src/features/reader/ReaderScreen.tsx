import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type {
  BookmarkEntry,
  ChapterPositionProgress,
  OpenedChapter,
  TableOfContentsEntry,
} from '../../application/reading/readingUseCases'
import { calculateReadingProgress } from '../../domain/reading/readingProgressPolicy'
import type { ReaderPreferences } from '../../domain/reading/readerPreferences'
import { ChapterBookmarksModal } from './ChapterBookmarksModal'
import { ReaderComfortControls } from './ReaderComfortControls'
import { TableOfContentsModal } from './TableOfContentsModal'

const CHAPTER_SWIPE_MIN_DISTANCE_PX = 72
const CHAPTER_SWIPE_HORIZONTAL_DOMINANCE_RATIO = 1.5
const SWIPE_EXCLUDED_TARGETS =
  'a, button, input, select, textarea, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="dialog"]'

interface ChapterSwipeGesture {
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
}

function isSwipeExcludedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SWIPE_EXCLUDED_TARGETS) !== null
}

interface ReaderScreenProps {
  readonly openedChapter: OpenedChapter
  readonly recoveryStatus?: string
  readonly preferences: ReaderPreferences
  readonly isBookmarked: boolean
  readonly bookmarks: readonly BookmarkEntry[]
  readonly tableOfContents: readonly TableOfContentsEntry[]
  readonly chapterPosition: ChapterPositionProgress | undefined
  readonly onChangePreferences: (newPreferences: ReaderPreferences) => void
  readonly onResetPreferences: () => void
  readonly onToggleBookmark: () => void
  readonly onSelectBookmark: (bookId: string, chapterId: string) => void
  readonly onRemoveBookmark: (bookId: string, chapterId: string) => void
  readonly onSelectChapter: (chapterId: string) => void
  readonly onBackToBook: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
  readonly onProgressChange?: (chapterProgress: number) => void
}

export function ReaderScreen({
  openedChapter,
  recoveryStatus,
  preferences,
  isBookmarked,
  bookmarks,
  tableOfContents,
  chapterPosition,
  onChangePreferences,
  onResetPreferences,
  onToggleBookmark,
  onSelectBookmark,
  onRemoveBookmark,
  onSelectChapter,
  onBackToBook,
  onPrevious,
  onNext,
  onProgressChange,
}: ReaderScreenProps) {
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [liveProgress, setLiveProgress] = useState({
    chapterId: openedChapter.chapter.id,
    percent: 0,
  })
  const tocTriggerRef = useRef<HTMLButtonElement>(null)
  const readerRef = useRef<HTMLElement>(null)
  const chapterSwipeGestureRef = useRef<ChapterSwipeGesture | null>(null)
  const onProgressChangeRef = useRef(onProgressChange)
  const latestChapterProgressRef = useRef(openedChapter.initialChapterProgress)
  const flushProgressRef = useRef<() => void>(() => {})
  const liveProgressPercent =
    liveProgress.chapterId === openedChapter.chapter.id
      ? liveProgress.percent
      : 0

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
  }, [onProgressChange])

  useEffect(() => {
    chapterSwipeGestureRef.current = null

    return () => {
      chapterSwipeGestureRef.current = null
    }
  }, [openedChapter.chapter.id])

  const cancelChapterSwipe = () => {
    chapterSwipeGestureRef.current = null
  }

  const handleProsePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    const isTouchLikePointer =
      event.pointerType === 'touch' || event.pointerType === 'pen'

    if (
      !event.isPrimary ||
      event.button !== 0 ||
      !isTouchLikePointer ||
      isSwipeExcludedTarget(event.target)
    ) {
      cancelChapterSwipe()
      return
    }

    chapterSwipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleProsePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = chapterSwipeGestureRef.current
    cancelChapterSwipe()

    if (
      !gesture ||
      event.pointerId !== gesture.pointerId ||
      isSwipeExcludedTarget(event.target)
    ) {
      return
    }

    const horizontalDistance = event.clientX - gesture.startX
    const verticalDistance = event.clientY - gesture.startY
    const absoluteHorizontalDistance = Math.abs(horizontalDistance)
    const absoluteVerticalDistance = Math.abs(verticalDistance)

    if (
      absoluteHorizontalDistance < CHAPTER_SWIPE_MIN_DISTANCE_PX ||
      absoluteHorizontalDistance <
        absoluteVerticalDistance *
          CHAPTER_SWIPE_HORIZONTAL_DOMINANCE_RATIO
    ) {
      return
    }

    if (horizontalDistance < 0 && openedChapter.hasNext) {
      onNext()
    } else if (horizontalDistance > 0 && openedChapter.hasPrevious) {
      onPrevious()
    }
  }

  useEffect(() => {
    flushProgressRef.current = () => {}
    const reader = readerRef.current

    if (openedChapter.isLocked || !reader) {
      return
    }

    latestChapterProgressRef.current = openedChapter.initialChapterProgress

    let framePending = false
    let frameId: number | undefined
    let lastReportedPercent: number | undefined

    const measureGeometry = () => {
      const viewportHeight = window.innerHeight
      const readerBounds = reader.getBoundingClientRect()
      const readerTop = window.scrollY + readerBounds.top
      const readerBottom =
        readerTop + Math.max(reader.scrollHeight, readerBounds.height)
      const documentScrollEnd = Math.max(
        document.documentElement.scrollHeight - viewportHeight,
        0,
      )
      const progressStart = Math.min(
        Math.max(readerTop, 0),
        documentScrollEnd,
      )
      const progressEnd = Math.min(
        Math.max(readerBottom - viewportHeight, progressStart),
        documentScrollEnd,
      )

      return {
        progressStart,
        progressEnd,
        progressDistance: progressEnd - progressStart,
      }
    }

    const updateProgress = () => {
      const { progressStart, progressEnd, progressDistance } =
        measureGeometry()

      let chapterProgress = 0

      if (window.scrollY > progressStart) {
        chapterProgress =
          window.scrollY >= progressEnd || progressDistance <= 0
            ? 1
            : Math.min(
                Math.max(
                  (window.scrollY - progressStart) / progressDistance,
                  0,
                ),
                1,
              )
      }

      latestChapterProgressRef.current = chapterProgress

      const progress = calculateReadingProgress({
        position: {
          bookId: openedChapter.book.book.id,
          chapterId: openedChapter.chapter.id,
          paragraphIndex: 0,
          chapterProgress,
        },
        chapterSequence: 1,
        totalChapters: 1,
      })
      const percent = progress.valid ? Math.round(progress.percent) : 0

      setLiveProgress((current) =>
        current.chapterId === openedChapter.chapter.id &&
        current.percent === percent
          ? current
          : { chapterId: openedChapter.chapter.id, percent },
      )

      if (lastReportedPercent !== percent) {
        lastReportedPercent = percent
        onProgressChangeRef.current?.(chapterProgress)
      }
    }

    const scheduleProgressUpdate = () => {
      if (framePending) {
        return
      }

      framePending = true

      if (typeof window.requestAnimationFrame !== 'function') {
        framePending = false
        updateProgress()
        return
      }

      frameId = window.requestAnimationFrame(() => {
        framePending = false
        updateProgress()
      })
    }

    const restoreTarget = openedChapter.initialChapterProgress

    if (restoreTarget > 0 && typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(() => {
        const { progressStart, progressDistance } = measureGeometry()
        const targetScrollY =
          progressDistance > 0
            ? progressStart + restoreTarget * progressDistance
            : progressStart

        window.scrollTo(0, targetScrollY)
        updateProgress()
      })
    } else {
      scheduleProgressUpdate()
    }

    window.addEventListener('scroll', scheduleProgressUpdate, { passive: true })
    window.addEventListener('resize', scheduleProgressUpdate)

    const flushProgress = () => {
      onProgressChangeRef.current?.(latestChapterProgressRef.current)
    }
    flushProgressRef.current = flushProgress
    window.addEventListener('pagehide', flushProgress)

    return () => {
      window.removeEventListener('scroll', scheduleProgressUpdate)
      window.removeEventListener('resize', scheduleProgressUpdate)
      window.removeEventListener('pagehide', flushProgress)

      if (
        frameId !== undefined &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(frameId)
      }
    }
  }, [
    openedChapter.book.book.id,
    openedChapter.chapter.id,
    openedChapter.isLocked,
    openedChapter.initialChapterProgress,
    preferences.fontScale,
    preferences.lineSpacing,
  ])

  return (
    <section
      ref={readerRef}
      className="reader-screen-container"
      data-theme={preferences.theme}
      data-font-scale={preferences.fontScale}
      data-line-spacing={preferences.lineSpacing}
      aria-label="閱讀器"
    >
      <header className="reader-toolbar">
        <ReaderComfortControls
          preferences={preferences}
          onChangePreferences={onChangePreferences}
          onResetPreferences={onResetPreferences}
        />

        <div className="reader-bookmark-toolbar">
          {!openedChapter.isLocked && (
            <button
              type="button"
              className={`button-bookmark ${isBookmarked ? 'is-active' : ''}`}
              onClick={onToggleBookmark}
              aria-label={isBookmarked ? '移除章節書籤' : '加入章節書籤'}
            >
              {isBookmarked ? '★ 已加入書籤' : '☆ 加入書籤'}
            </button>
          )}

          <button
            type="button"
            className="button-secondary button-open-bookmarks"
            onClick={() => setIsBookmarksOpen(true)}
            aria-label="開啟書籤列表"
          >
            書籤列表 ({bookmarks.length})
          </button>

          <button
            ref={tocTriggerRef}
            type="button"
            className="button-secondary button-open-toc"
            onClick={() => setIsTocOpen(true)}
            aria-label="開啟章節目錄"
          >
            章節目錄
          </button>
        </div>
      </header>

      <h1 className="screen-heading">{openedChapter.chapter.title}</h1>

      {recoveryStatus && (
        <div
          className="session-recovery-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {recoveryStatus}
        </div>
      )}

      {chapterPosition && (
        <div
          className="chapter-position-progress"
          role="progressbar"
          aria-label="目前章節位置"
          aria-valuemin={1}
          aria-valuemax={chapterPosition.totalChapters}
          aria-valuenow={chapterPosition.currentPosition}
          aria-valuetext={`第 ${chapterPosition.currentPosition} / ${chapterPosition.totalChapters} 章`}
        >
          <span aria-hidden="true">
            第 {chapterPosition.currentPosition} / {chapterPosition.totalChapters} 章
          </span>
          <span className="chapter-position-track" aria-hidden="true">
            <span
              className="chapter-position-fill"
              style={{
                width: `${
                  (chapterPosition.currentPosition /
                    chapterPosition.totalChapters) *
                  100
                }%`,
              }}
            />
          </span>
        </div>
      )}

      {openedChapter.isLocked ? (
        <div className="locked-notice" role="note">
          本章尚未開放，沒有載入任何內文。
        </div>
      ) : (
        <article
          className={`reader-prose theme-${preferences.theme} font-scale-${preferences.fontScale} line-spacing-${preferences.lineSpacing}`}
          aria-label="章節內文"
          onPointerDown={handleProsePointerDown}
          onPointerUp={handleProsePointerUp}
          onPointerCancel={cancelChapterSwipe}
          onPointerLeave={cancelChapterSwipe}
        >
          {openedChapter.prose.map((paragraph) => (
            <p data-testid="chapter-prose" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </article>
      )}

      <nav className="reader-navigation" aria-label="章節導覽">
        {openedChapter.hasPrevious && (
          <button
            className="button-secondary"
            type="button"
            onClick={onPrevious}
          >
            上一章
          </button>
        )}
        {openedChapter.hasNext && (
          <button type="button" onClick={onNext}>
            下一章
          </button>
        )}
        <button
          className="button-secondary button-back-to-book"
          type="button"
          onClick={() => {
            flushProgressRef.current()
            onBackToBook()
          }}
          aria-label="返回作品"
        >
          返回作品
        </button>
      </nav>

      <nav
        className="reader-persistent-navigation"
        aria-label="章節快捷導覽"
        data-testid="reader-persistent-navigation"
      >
        <button
          type="button"
          className="button-secondary button-persistent-nav button-persistent-prev"
          onClick={onPrevious}
          disabled={!openedChapter.hasPrevious}
          aria-disabled={!openedChapter.hasPrevious}
          aria-label="上一章"
        >
          上一章
        </button>

        <div className="persistent-reader-context">
          {chapterPosition ? (
            <span className="persistent-position-text">
              第 {chapterPosition.currentPosition} /{' '}
              {chapterPosition.totalChapters} 章
            </span>
          ) : (
            <span className="persistent-position-text">
              {openedChapter.chapter.title}
            </span>
          )}

          {!openedChapter.isLocked && (
            <div
              className="chapter-reading-progress"
              role="progressbar"
              aria-label="本章閱讀進度"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={liveProgressPercent}
              aria-valuetext={`本章閱讀進度 ${liveProgressPercent}%`}
            >
              <span
                className="chapter-reading-progress-label"
                aria-hidden="true"
              >
                本章閱讀進度 {liveProgressPercent}%
              </span>
              <span
                className="chapter-reading-progress-track"
                aria-hidden="true"
              >
                <span
                  className="chapter-reading-progress-fill"
                  style={{ width: `${liveProgressPercent}%` }}
                />
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="button-persistent-nav button-persistent-next"
          onClick={onNext}
          disabled={!openedChapter.hasNext}
          aria-disabled={!openedChapter.hasNext}
          aria-label="下一章"
        >
          下一章
        </button>
      </nav>

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        已切換至：{openedChapter.chapter.title}
      </div>

      <ChapterBookmarksModal
        isOpen={isBookmarksOpen}
        bookmarks={bookmarks}
        onClose={() => setIsBookmarksOpen(false)}
        onSelectBookmark={onSelectBookmark}
        onRemoveBookmark={onRemoveBookmark}
      />

      <TableOfContentsModal
        isOpen={isTocOpen}
        entries={tableOfContents}
        triggerRef={tocTriggerRef}
        onClose={() => setIsTocOpen(false)}
        onSelectChapter={onSelectChapter}
      />
    </section>
  )
}
