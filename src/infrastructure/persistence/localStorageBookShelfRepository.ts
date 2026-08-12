import type { BookShelfRepository } from '../../application/library/bookShelfRepository'

export const BOOK_SHELF_STORAGE_KEY =
  'innovative-novels:book-shelf:v1'
export const BOOKSHELF_STORAGE_KEY = BOOK_SHELF_STORAGE_KEY

interface BookShelfEnvelope {
  readonly schemaVersion: 1
  readonly bookIds: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBookShelfEnvelope(
  serialized: string | null,
): BookShelfEnvelope | undefined {
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

    return { schemaVersion: 1, bookIds }
  } catch {
    return undefined
  }
}

export class LocalStorageBookShelfRepository implements BookShelfRepository {
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  list(): readonly string[] {
    try {
      return (
        parseBookShelfEnvelope(this.storage.getItem(BOOK_SHELF_STORAGE_KEY))
          ?.bookIds ?? []
      )
    } catch {
      return []
    }
  }

  contains(requestedBookId: string): boolean {
    return this.list().includes(requestedBookId)
  }

  add(requestedBookId: string): void {
    if (requestedBookId.trim().length === 0) {
      return
    }

    try {
      const current = this.list()
      if (current.includes(requestedBookId)) {
        return
      }

      this.save([...current, requestedBookId])
    } catch {
      // Storage failure leaves the catalog and reading journey usable.
    }
  }

  remove(requestedBookId: string): void {
    try {
      this.save(this.list().filter((bookId) => bookId !== requestedBookId))
    } catch {
      // Storage failure leaves the catalog and reading journey usable.
    }
  }

  private save(bookIds: readonly string[]): void {
    const envelope: BookShelfEnvelope = {
      schemaVersion: 1,
      bookIds,
    }

    this.storage.setItem(BOOK_SHELF_STORAGE_KEY, JSON.stringify(envelope))
  }
}
