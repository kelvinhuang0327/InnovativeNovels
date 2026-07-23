import type { ReadingPosition } from './readingPosition'

export type ReadingProgressResult =
  | { readonly valid: true; readonly percent: number }
  | { readonly valid: false; readonly reason: string }

export interface ReadingProgressInput {
  readonly position: ReadingPosition
  readonly chapterSequence: number
  readonly totalChapters: number
}

export function calculateReadingProgress({
  position,
  chapterSequence,
  totalChapters,
}: ReadingProgressInput): ReadingProgressResult {
  if (!Number.isInteger(totalChapters) || totalChapters < 1) {
    return { valid: false, reason: 'totalChapters must be a positive integer' }
  }

  if (
    !Number.isInteger(chapterSequence) ||
    chapterSequence < 1 ||
    chapterSequence > totalChapters
  ) {
    return {
      valid: false,
      reason: 'chapterSequence must identify a chapter in the book',
    }
  }

  if (!Number.isInteger(position.paragraphIndex) || position.paragraphIndex < 0) {
    return {
      valid: false,
      reason: 'paragraphIndex must be a non-negative integer',
    }
  }

  if (
    !Number.isFinite(position.chapterProgress) ||
    position.chapterProgress < 0 ||
    position.chapterProgress > 1
  ) {
    return {
      valid: false,
      reason: 'chapterProgress must be a normalized value from 0 to 1',
    }
  }

  return {
    valid: true,
    percent:
      ((chapterSequence - 1 + position.chapterProgress) / totalChapters) * 100,
  }
}
