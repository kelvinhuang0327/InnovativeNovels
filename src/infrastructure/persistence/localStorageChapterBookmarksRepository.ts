import type { ChapterBookmarksRepository } from '../../application/reading/chapterBookmarksRepository'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ChapterBookmark } from '../../domain/reading/chapterBookmark'

export const CHAPTER_BOOKMARKS_STORAGE_KEY =
  'innovative-novels:chapter-bookmarks:v1'

interface StoredBookmark {
  readonly bookId: string
  readonly chapterId: string
}

interface ChapterBookmarksEnvelope {
  readonly schemaVersion: 1
  readonly bookmarks: readonly StoredBookmark[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBookmarksEnvelope(
  serialized: string | null,
): ChapterBookmarksEnvelope | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      !Array.isArray(candidate.bookmarks)
    ) {
      return undefined
    }

    const bookmarks: StoredBookmark[] = []

    for (const item of candidate.bookmarks) {
      if (
        !isRecord(item) ||
        typeof item.bookId !== 'string' ||
        item.bookId.trim().length === 0 ||
        typeof item.chapterId !== 'string' ||
        item.chapterId.trim().length === 0
      ) {
        continue
      }

      bookmarks.push({
        bookId: item.bookId,
        chapterId: item.chapterId,
      })
    }

    return { schemaVersion: 1, bookmarks }
  } catch {
    return undefined
  }
}

export class LocalStorageChapterBookmarksRepository
  implements ChapterBookmarksRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  list(): readonly ChapterBookmark[] {
    try {
      const envelope = parseBookmarksEnvelope(
        this.storage.getItem(CHAPTER_BOOKMARKS_STORAGE_KEY),
      )

      if (!envelope) {
        return []
      }

      return envelope.bookmarks.map((entry) => ({
        bookId: bookId(entry.bookId),
        chapterId: chapterId(entry.chapterId),
      }))
    } catch {
      return []
    }
  }

  add(bookmark: ChapterBookmark): void {
    try {
      const current = this.list()
      const exists = current.some(
        (existing) =>
          existing.bookId === bookmark.bookId &&
          existing.chapterId === bookmark.chapterId,
      )

      if (exists) {
        return
      }

      const updated = [
        ...current,
        { bookId: bookmark.bookId, chapterId: bookmark.chapterId },
      ]

      this.saveList(updated)
    } catch {
      // Storage failure fallbacks.
    }
  }

  remove(targetBookId: string, targetChapterId: string): void {
    try {
      const current = this.list()
      const updated = current.filter(
        (existing) =>
          !(
            existing.bookId === targetBookId &&
            existing.chapterId === targetChapterId
          ),
      )

      this.saveList(updated)
    } catch {
      // Storage failure fallbacks.
    }
  }

  private saveList(bookmarks: readonly ChapterBookmark[]): void {
    const envelope: ChapterBookmarksEnvelope = {
      schemaVersion: 1,
      bookmarks: bookmarks.map((b) => ({
        bookId: b.bookId,
        chapterId: b.chapterId,
      })),
    }

    this.storage.setItem(
      CHAPTER_BOOKMARKS_STORAGE_KEY,
      JSON.stringify(envelope),
    )
  }
}
