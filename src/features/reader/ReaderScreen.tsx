import type { OpenedChapter } from '../../application/reading/readingUseCases'

interface ReaderScreenProps {
  readonly openedChapter: OpenedChapter
  readonly onBackToBook: () => void
  readonly onPrevious: () => void
  readonly onNext: () => void
}

export function ReaderScreen({
  openedChapter,
  onBackToBook,
  onPrevious,
  onNext,
}: ReaderScreenProps) {
  return (
    <section aria-label="閱讀器">
      <h1 className="screen-heading">{openedChapter.chapter.title}</h1>

      {openedChapter.isLocked ? (
        <div className="locked-notice" role="note">
          本章尚未開放，沒有載入任何內文。
        </div>
      ) : (
        <article className="reader-prose" aria-label="章節內文">
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
          className="button-secondary"
          type="button"
          onClick={onBackToBook}
        >
          返回書籍
        </button>
      </nav>
    </section>
  )
}
