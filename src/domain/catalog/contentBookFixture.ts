import type { ChapterAccess } from '../access/chapterAccess'

export const CONTENT_BOOK_SCHEMA = 'innovative-novels/content-book/v1'

export interface ContentBookFixtureChapterV1 {
  readonly chapterId: string
  readonly sequence: number
  readonly title: string
  readonly access: ChapterAccess
  readonly prose?: readonly string[]
}

export interface ContentBookFixtureV1 {
  readonly schema: typeof CONTENT_BOOK_SCHEMA
  readonly bookId: string
  readonly catalogSequence: number
  readonly title: string
  readonly authorName: string
  readonly categoryLabel: string
  readonly description: string
  readonly chapters: readonly ContentBookFixtureChapterV1[]
}
