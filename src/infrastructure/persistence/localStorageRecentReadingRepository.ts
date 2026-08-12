import type { RecentReadingRepository } from '../../application/library/recentReadingRepository'

export const RECENT_READING_STORAGE_KEY =
  'innovative-novels:recent-reading:v1'
export const MAX_RECENT_READING_BOOKS = 20

interface RecentReadingEnvelope {
  readonly schemaVersion: 1
  readonly bookIds: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecentReadingEnvelope(
  serialized: string | null,
): RecentReadingEnvelope | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      !Array.isArray(candidate.bookIds)
    ) {
      return undefined
    }

    const bookIds: string[] = []
    for (const value of candidate.bookIds) {
      if (
        typeof value !== 'string' ||
        value.trim().length === 0 ||
        bookIds.includes(value)
      ) {
        continue
      }

      bookIds.push(value)
    }

    return {
      schemaVersion: 1,
      bookIds: bookIds.slice(0, MAX_RECENT_READING_BOOKS),
    }
  } catch {
    return undefined
  }
}

export class LocalStorageRecentReadingRepository
  implements RecentReadingRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  list(): readonly string[] {
    try {
      return (
        parseRecentReadingEnvelope(
          this.storage.getItem(RECENT_READING_STORAGE_KEY),
        )?.bookIds ?? []
      )
    } catch {
      return []
    }
  }

  touch(requestedBookId: string): void {
    if (requestedBookId.trim().length === 0) {
      return
    }

    try {
      const updated = [
        requestedBookId,
        ...this.list().filter((bookId) => bookId !== requestedBookId),
      ].slice(0, MAX_RECENT_READING_BOOKS)

      this.save(updated)
    } catch {
      // Storage failure leaves the catalog and reading journey usable.
    }
  }

  private save(bookIds: readonly string[]): void {
    const envelope: RecentReadingEnvelope = {
      schemaVersion: 1,
      bookIds,
    }

    this.storage.setItem(RECENT_READING_STORAGE_KEY, JSON.stringify(envelope))
  }
}
