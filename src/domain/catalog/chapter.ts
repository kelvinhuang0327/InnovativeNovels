import type { ChapterAccess } from '../access/chapterAccess'
import type { BookId, ChapterId } from './identifiers'

declare const chapterSequenceBrand: unique symbol

export type ChapterSequence = number & {
  readonly [chapterSequenceBrand]: 'ChapterSequence'
}

export interface Chapter {
  readonly id: ChapterId
  readonly bookId: BookId
  readonly title: string
  readonly sequence: ChapterSequence
  readonly access: ChapterAccess
}

export function chapterSequence(value: number): ChapterSequence {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError('ChapterSequence must be a positive integer')
  }

  return value as ChapterSequence
}
