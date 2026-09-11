import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ContinueReadingEntry } from '../../application/reading/readingUseCases'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import { chapterSequence } from '../../domain/catalog/chapter'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import { ContinueReadingShelf } from './ContinueReadingShelf'

function makeEntry(
  id: string,
  title: string,
  authorName: string,
  chapterProgress: number,
): ContinueReadingEntry {
  const typedBookId = bookId(id)
  const chapter = {
    id: chapterId(`${id}-chapter-1`),
    bookId: typedBookId,
    title: `${title} 第一章`,
    sequence: chapterSequence(1),
    access: CHAPTER_ACCESS.READABLE,
  }
  const book: ContentBook = {
    book: {
      id: typedBookId,
      title,
      authorName,
      categoryLabel: '分類',
    },
    description: '故事簡介',
    chapters: [chapter],
  }

  return {
    book,
    chapter,
    position: {
      bookId: typedBookId,
      chapterId: chapter.id,
      paragraphIndex: 0,
      chapterProgress,
    },
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ContinueReadingShelf', () => {
  it('shows each saved chapter percentage with accessible progress semantics', () => {
    render(
      <ContinueReadingShelf
        entries={[
          makeEntry('book-a', '海邊書店', '沈墨', 0),
          makeEntry('book-b', '山中劍客', '岑海', 0.425),
          makeEntry('book-c', '城市夜歸人', '林晚', 1),
        ]}
        onContinueBook={vi.fn()}
      />,
    )

    expect(screen.getByText('本章進度 0%')).toBeInTheDocument()
    expect(screen.getByText('本章進度 43%')).toBeInTheDocument()
    expect(screen.getByText('本章進度 100%')).toBeInTheDocument()

    for (const [percentage, label] of [
      ['0', '本章進度 0%'],
      ['43', '本章進度 43%'],
      ['100', '本章進度 100%'],
    ]) {
      const progress = screen.getByRole('progressbar', { name: label })
      expect(progress).toHaveAttribute('max', '100')
      expect(progress).toHaveAttribute('value', percentage)
    }
  })

  it('clamps out-of-range values and safely handles non-finite progress', () => {
    render(
      <ContinueReadingShelf
        entries={[
          makeEntry('book-negative', '負值', '作者一', -0.2),
          makeEntry('book-over', '超過', '作者二', 1.2),
          makeEntry('book-nan', '不是數字', '作者三', Number.NaN),
          makeEntry('book-infinity', '無限大', '作者四', Number.POSITIVE_INFINITY),
        ]}
        onContinueBook={vi.fn()}
      />,
    )

    expect(screen.getAllByText('本章進度 0%', { selector: 'p' })).toHaveLength(3)
    expect(screen.getAllByText('本章進度 100%', { selector: 'p' })).toHaveLength(1)
    expect(screen.queryByText(/NaN%|Infinity%/)).not.toBeInTheDocument()

    expect(
      screen.getAllByRole('progressbar').map((progress) => progress.getAttribute('value')),
    ).toEqual(['0', '100', '0', '0'])
  })

  it('keeps card details independent and invokes Continue Reading once for the selected book', () => {
    const onContinueBook = vi.fn()
    render(
      <ContinueReadingShelf
        entries={[
          makeEntry('book-a', '海邊書店', '沈墨', 0.42),
          makeEntry('book-b', '山中劍客', '岑海', 0.8),
        ]}
        onContinueBook={onContinueBook}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('海邊書店')).toBeInTheDocument()
    expect(within(items[0]).getByText('沈墨')).toBeInTheDocument()
    expect(within(items[0]).getByText('海邊書店 第一章')).toBeInTheDocument()
    expect(within(items[0]).getByText('本章進度 42%')).toBeInTheDocument()
    expect(within(items[1]).getByText('山中劍客')).toBeInTheDocument()
    expect(within(items[1]).getByText('岑海')).toBeInTheDocument()
    expect(within(items[1]).getByText('山中劍客 第一章')).toBeInTheDocument()
    expect(within(items[1]).getByText('本章進度 80%')).toBeInTheDocument()

    fireEvent.click(within(items[1]).getByRole('button', { name: '繼續閱讀' }))

    expect(onContinueBook).toHaveBeenCalledTimes(1)
    expect(onContinueBook).toHaveBeenCalledWith('book-b')
  })
})
