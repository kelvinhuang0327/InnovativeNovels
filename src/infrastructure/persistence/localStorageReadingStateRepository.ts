import type { ReadingStateRepository } from '../../application/reading/readingStateRepository'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ReadingPosition } from '../../domain/reading/readingPosition'

export const READING_STATE_STORAGE_KEY =
  'innovative-novels:reading-state:v1'

interface StoredPosition {
  readonly bookId: string
  readonly chapterId: string
}

interface ReadingStateEnvelope {
  readonly schemaVersion: 1
  readonly positions: Record<string, StoredPosition>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEnvelope(serialized: string | null): ReadingStateEnvelope | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      !isRecord(candidate.positions)
    ) {
      return undefined
    }

    const positions: Record<string, StoredPosition> = {}

    for (const [positionBookId, value] of Object.entries(candidate.positions)) {
      if (
        !isRecord(value) ||
        value.bookId !== positionBookId ||
        typeof value.chapterId !== 'string' ||
        value.chapterId.trim().length === 0
      ) {
        return undefined
      }

      positions[positionBookId] = {
        bookId: positionBookId,
        chapterId: value.chapterId,
      }
    }

    return { schemaVersion: 1, positions }
  } catch {
    return undefined
  }
}

export class LocalStorageReadingStateRepository
  implements ReadingStateRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  load(requestedBookId: string): ReadingPosition | undefined {
    try {
      const envelope = parseEnvelope(
        this.storage.getItem(READING_STATE_STORAGE_KEY),
      )
      const position = envelope?.positions[requestedBookId]

      return position
        ? {
            bookId: bookId(position.bookId),
            chapterId: chapterId(position.chapterId),
            paragraphIndex: 0,
            chapterProgress: 0,
          }
        : undefined
    } catch {
      return undefined
    }
  }

  save(position: ReadingPosition): void {
    try {
      const current =
        parseEnvelope(this.storage.getItem(READING_STATE_STORAGE_KEY)) ?? {
          schemaVersion: 1,
          positions: {},
        }

      this.storage.setItem(
        READING_STATE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: 1,
          positions: {
            ...current.positions,
            [position.bookId]: {
              bookId: position.bookId,
              chapterId: position.chapterId,
            },
          },
        } satisfies ReadingStateEnvelope),
      )
    } catch {
      // Storage failures leave the reading journey usable without persistence.
    }
  }
}
