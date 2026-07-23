import type { BookId } from './identifiers'

export interface Book {
  readonly id: BookId
  readonly title: string
  readonly authorName: string
  readonly categoryLabel: string
}
