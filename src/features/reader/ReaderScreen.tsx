import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
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

interface PagedReaderMetrics {
  readonly pageCount: number
  readonly pageStep: number
}

function isSwipeExcludedTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SWIPE_EXCLUDED_TARGETS) !== null
}

function normalizedPageProgress(pageIndex: number, pageCount: number): number {
  return pageCount > 1 ? pageIndex / (pageCount - 1) : 0
}

function clampChapterProgress(chapterProgress: number): number {
  return Number.isFinite(chapterProgress)
    ? Math.min(Math.max(chapterProgress, 0), 1)
    : 0
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
  readonly canNavigateNextChapter?: boolean
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
  canNavigateNextChapter = false,
  onProgressChange,
}: ReaderScreenProps) {
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(false)
  const [liveProgress, setLiveProgress] = useState({
    chapterId: openedChapter.chapter.id,
    percent: 0,
  })
  const [pagedReaderState, setPagedReaderState] = useState<PagedReaderState>({
    chapterId: openedChapter.chapter.id,
    pageIndex: 0,
    pageCount: 1,
  })
  const tocTriggerRef = useRef<HTMLButtonElement>(null)
  const readerRef = useRef<HTMLElement>(null)
  const proseRef = useRef<HTMLElement>(null)
  const pagedViewportRef = useRef<HTMLDivElement>(null)
  const readerSwipeGestureRef = useRef<ReaderSwipeGesture | null>(null)
  const pagedReaderMetricsRef = useRef<PagedReaderMetrics>({
    pageCount: 1,
    pageStep: 0,
  })
  const pagedPageIndexRef = useRef(0)
  const progressChapterIdRef = useRef(openedChapter.chapter.id)
  const onProgressChangeRef = useRef(onProgressChange)
  const latestChapterProgressRef = useRef(openedChapter.initialChapterProgress)
  const flushProgressRef = useRef<() => void>(() => {})
  const liveProgressPercent =
    liveProgress.chapterId === openedChapter.chapter.id
      ? liveProgress.percent
      : 0
  const currentPagedState =
    pagedReaderState.chapterId === openedChapter.chapter.id
      ? pagedReaderState
      : {
          chapterId: openedChapter.chapter.id,
          pageIndex: 0,
          pageCount: 1,
        }

  useEffect(() => {
    onProgressChangeRef.current = onProgressChange
  }, [onProgressChange])

  useEffect(() => {
    readerSwipeGestureRef.current = null

    return () => {
      readerSwipeGestureRef.current = null
    }
  }, [openedChapter.chapter.id, preferences.readingMode])

  const updateLiveProgress = useCallback(
    (chapterProgress: number) => {
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

      return percent
    },
    [openedChapter.book.book.id, openedChapter.chapter.id],
  )

  const applyPagedPage = useCallback(
    (
      pageIndex: number,
      pageCount: number,
      shouldPersistProgress: boolean,
    ) => {
      const boundedPageIndex = Math.min(
        Math.max(pageIndex, 0),
        Math.max(pageCount - 1, 0),
      )
      const previousProgress = latestChapterProgressRef.current
      const chapterProgress =
        pageCount > 1
          ? normalizedPageProgress(boundedPageIndex, pageCount)
          : clampChapterProgress(previousProgress)

      pagedPageIndexRef.current = boundedPageIndex
      setPagedReaderState({
        chapterId: openedChapter.chapter.id,
        pageIndex: boundedPageIndex,
        pageCount,
      })

      const viewport = pagedViewportRef.current
      if (viewport) {
        viewport.scrollLeft =
          boundedPageIndex * pagedReaderMetricsRef.current.pageStep
      }

      updateLiveProgress(chapterProgress)

      if (shouldPersistProgress && chapterProgress !== previousProgress) {
        onProgressChangeRef.current?.(chapterProgress)
      }
    },
    [openedChapter.chapter.id, updateLiveProgress],
  )

  const turnPagedPage = useCallback(
    (direction: -1 | 1) => {
      const { pageCount } = pagedReaderMetricsRef.current
      const destinationPage = pagedPageIndexRef.current + direction

      if (destinationPage >= 0 && destinationPage < pageCount) {
        applyPagedPage(destinationPage, pageCount, true)
        return
      }

      if (
        direction === 1 &&
        openedChapter.hasNext &&
        canNavigateNextChapter
      ) {
        onNext()
      } else if (direction === -1 && openedChapter.hasPrevious) {
        onPrevious()
      }
    },
    [
      applyPagedPage,
      onNext,
      onPrevious,
      canNavigateNextChapter,
      openedChapter.hasNext,
      openedChapter.hasPrevious,
    ],
  )

  const cancelReaderSwipe = () => {
    readerSwipeGestureRef.current = null
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
      cancelReaderSwipe()
      return
    }

    readerSwipeGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }

  const handleProsePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = readerSwipeGestureRef.current
    cancelReaderSwipe()

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

    const direction = horizontalDistance < 0 ? 1 : -1

    if (preferences.readingMode === 'paged') {
      turnPagedPage(direction)
    } else if (direction === 1 && openedChapter.hasNext) {
      onNext()
    } else if (direction === -1 && openedChapter.hasPrevious) {
      onPrevious()
    }
  }

  const handlePagedViewportKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (
      event.repeat ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'PageDown') {
      event.preventDefault()
      turnPagedPage(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      turnPagedPage(-1)
    }
  }

  useEffect(() => {
    flushProgressRef.current = () => {}
    const reader = readerRef.current

    if (
      preferences.readingMode !== 'continuous' ||
      openedChapter.isLocked ||
      !reader
    ) {
      return
    }

    const restoreTarget =
      progressChapterIdRef.current === openedChapter.chapter.id
        ? latestChapterProgressRef.current
        : openedChapter.initialChapterProgress
    progressChapterIdRef.current = openedChapter.chapter.id
    latestChapterProgressRef.current = restoreTarget

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

      const percent = updateLiveProgress(chapterProgress)

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
    preferences.fontFamily,
    preferences.fontScale,
    preferences.letterSpacing,
    preferences.lineSpacing,
    preferences.readingMode,
    updateLiveProgress,
  ])

  useLayoutEffect(() => {
    flushProgressRef.current = () => {}
    const viewport = pagedViewportRef.current
    const prose = proseRef.current

    if (
      preferences.readingMode !== 'paged' ||
      openedChapter.isLocked ||
      !viewport ||
      !prose
    ) {
      return
    }

    const startsNewChapter =
      progressChapterIdRef.current !== openedChapter.chapter.id
    let restoreTarget = startsNewChapter
      ? openedChapter.initialChapterProgress
      : latestChapterProgressRef.current
    progressChapterIdRef.current = openedChapter.chapter.id
    latestChapterProgressRef.current = restoreTarget

    let animationFrameId: number | undefined
    let framePending = false
    let isActive = true

    const measurePages = () => {
      framePending = false
      const viewportWidth = viewport.clientWidth

      if (viewportWidth <= 0) {
        return
      }

      prose.style.columnWidth = `${viewportWidth}px`
      const computedColumnGap = Number.parseFloat(
        window.getComputedStyle(prose).columnGap,
      )
      const columnGap = Number.isFinite(computedColumnGap)
        ? computedColumnGap
        : 0
      const pageStep = viewportWidth + columnGap
      const pageCount = Math.max(
        1,
        Math.ceil((prose.scrollWidth + columnGap - 1) / pageStep),
      )
      const pageIndex =
        pageCount > 1
          ? Math.round(restoreTarget * (pageCount - 1))
          : 0

      pagedReaderMetricsRef.current = { pageCount, pageStep }
      applyPagedPage(pageIndex, pageCount, true)
      restoreTarget = latestChapterProgressRef.current
    }

    const scheduleMeasurement = () => {
      if (framePending) {
        return
      }

      framePending = true
      if (typeof window.requestAnimationFrame === 'function') {
        animationFrameId = window.requestAnimationFrame(measurePages)
      } else {
        measurePages()
      }
    }

    const resizeObserver =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(scheduleMeasurement)
        : undefined
    resizeObserver?.observe(viewport)
    window.addEventListener('resize', scheduleMeasurement)

    const flushProgress = () => {
      onProgressChangeRef.current?.(latestChapterProgressRef.current)
    }
    flushProgressRef.current = flushProgress
    window.addEventListener('pagehide', flushProgress)

    scheduleMeasurement()
    void document.fonts?.ready.then(() => {
      if (isActive) {
        scheduleMeasurement()
      }
    })

    return () => {
      isActive = false
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasurement)
      window.removeEventListener('pagehide', flushProgress)
      prose.style.removeProperty('column-width')

      if (
        animationFrameId !== undefined &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(animationFrameId)
      }
    }
  }, [
    applyPagedPage,
    openedChapter.chapter.id,
    openedChapter.initialChapterProgress,
    openedChapter.isLocked,
    preferences.fontFamily,
    preferences.fontScale,
    preferences.letterSpacing,
    preferences.lineSpacing,
    preferences.readingMode,
  ])

  return (
    <section
      ref={readerRef}
      className="reader-screen-container"
      data-theme={preferences.theme}
      data-font-family={preferences.fontFamily}
      data-font-scale={preferences.fontScale}
      data-letter-spacing={preferences.letterSpacing}
      data-line-spacing={preferences.lineSpacing}
      data-reading-mode={preferences.readingMode}
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
      ) : preferences.readingMode === 'paged' ? (
        <div className="reader-paged-shell">
          <div
            ref={pagedViewportRef}
            className="reader-paged-viewport"
            tabIndex={0}
            aria-label="分頁閱讀區"
            onKeyDown={handlePagedViewportKeyDown}
            onPointerDown={handleProsePointerDown}
            onPointerUp={handleProsePointerUp}
            onPointerCancel={cancelReaderSwipe}
            onPointerLeave={cancelReaderSwipe}
          >
            <article
              ref={proseRef}
              className={`reader-prose reader-prose-paged theme-${preferences.theme} font-family-${preferences.fontFamily} font-scale-${preferences.fontScale} letter-spacing-${preferences.letterSpacing} line-spacing-${preferences.lineSpacing}`}
              aria-label="章節內文"
            >
              {openedChapter.prose.map((paragraph) => (
                <p data-testid="chapter-prose" key={paragraph}>
                  {paragraph}
                </p>
              ))}
            </article>
          </div>

          <nav className="reader-page-navigation" aria-label="分頁導覽">
            <button
              type="button"
              className="button-secondary"
              onClick={() => turnPagedPage(-1)}
              disabled={
                currentPagedState.pageIndex === 0 &&
                !openedChapter.hasPrevious
              }
            >
              上一頁
            </button>
            <span
              className="reader-page-status"
              role="status"
              aria-live="polite"
              aria-label="分頁位置"
            >
              第 {currentPagedState.pageIndex + 1} /{' '}
              {currentPagedState.pageCount} 頁
            </span>
            <button
              type="button"
              onClick={() => turnPagedPage(1)}
              disabled={
                currentPagedState.pageIndex ===
                  currentPagedState.pageCount - 1 &&
                !canNavigateNextChapter
              }
            >
              下一頁
            </button>
          </nav>
        </div>
      ) : (
        <article
          ref={proseRef}
          className={`reader-prose theme-${preferences.theme} font-family-${preferences.fontFamily} font-scale-${preferences.fontScale} letter-spacing-${preferences.letterSpacing} line-spacing-${preferences.lineSpacing}`}
          aria-label="章節內文"
          onPointerDown={handleProsePointerDown}
          onPointerUp={handleProsePointerUp}
          onPointerCancel={cancelReaderSwipe}
          onPointerLeave={cancelReaderSwipe}
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
