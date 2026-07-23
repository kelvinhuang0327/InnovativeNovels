import { describe, expect, it } from 'vitest'
import { bookId, chapterId } from '../catalog/identifiers'
import type { ReadingPosition } from './readingPosition'
import { calculateReadingProgress } from './readingProgressPolicy'

const position: ReadingPosition = {
  bookId: bookId('book-alpha'),
  chapterId: chapterId('chapter-beta'),
  paragraphIndex: 4,
  chapterProgress: 0.5,
}

describe('ReadingProgressPolicy', () => {
  it('derives whole-book progress from chapter order and local progress', () => {
    expect(
      calculateReadingProgress({
        position,
        chapterSequence: 2,
        totalChapters: 4,
      }),
    ).toEqual({ valid: true, percent: 37.5 })
  })

  it('handles the start and completed boundaries', () => {
    expect(
      calculateReadingProgress({
        position: { ...position, chapterProgress: 0 },
        chapterSequence: 1,
        totalChapters: 4,
      }),
    ).toEqual({ valid: true, percent: 0 })

    expect(
      calculateReadingProgress({
        position: { ...position, chapterProgress: 1 },
        chapterSequence: 4,
        totalChapters: 4,
      }),
    ).toEqual({ valid: true, percent: 100 })
  })

  it.each([
    {
      input: { position, chapterSequence: 0, totalChapters: 4 },
      reason: 'chapterSequence must identify a chapter in the book',
    },
    {
      input: {
        position: { ...position, paragraphIndex: -1 },
        chapterSequence: 1,
        totalChapters: 4,
      },
      reason: 'paragraphIndex must be a non-negative integer',
    },
    {
      input: {
        position: { ...position, chapterProgress: Number.NaN },
        chapterSequence: 1,
        totalChapters: 4,
      },
      reason: 'chapterProgress must be a normalized value from 0 to 1',
    },
  ])('rejects an invalid or unsupported position', ({ input, reason }) => {
    expect(calculateReadingProgress(input)).toEqual({ valid: false, reason })
  })
})
