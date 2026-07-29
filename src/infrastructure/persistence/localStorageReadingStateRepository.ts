import type { ReadingStateRepository } from '../../application/reading/readingStateRepository'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ReadingPosition } from '../../domain/reading/readingPosition'

export const READING_STATE_STORAGE_KEY =
  'innovative-novels:reading-state:v1'

const CURRENT_SCHEMA_VERSION = 2

interface StoredPosition {
  readonly bookId: string
  readonly chapterId: string
  readonly chapterProgress: number
}

interface ReadingStateEnvelope {
  readonly schemaVersion: 1 | 2
  readonly positions: Record<string, StoredPosition>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidChapterProgress(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  )
}

function parseEnvelope(serialized: string | null): ReadingStateEnvelope | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) ||
      !isRecord(candidate.positions)
    ) {
      return undefined
    }

    const schemaVersion = candidate.schemaVersion
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
        chapterProgress:
          schemaVersion === 2 && isValidChapterProgress(value.chapterProgress)
            ? value.chapterProgress
            : 0,
      }
    }

    return { schemaVersion, positions }
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
            chapterProgress: position.chapterProgress,
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
          schemaVersion: CURRENT_SCHEMA_VERSION,
          positions: {},
        }

      const chapterProgress = isValidChapterProgress(position.chapterProgress)
        ? position.chapterProgress
        : 0

      this.storage.setItem(
        READING_STATE_STORAGE_KEY,
        JSON.stringify({
          schemaVersion: CURRENT_SCHEMA_VERSION,
          positions: {
            ...current.positions,
            [position.bookId]: {
              bookId: position.bookId,
              chapterId: position.chapterId,
              chapterProgress,
            },
          },
        } satisfies ReadingStateEnvelope),
      )
    } catch {
      // Storage failures leave the reading journey usable without persistence.
    }
  }

  listSavedPositions(): readonly ReadingPosition[] {
    try {
      const envelope = parseEnvelope(
        this.storage.getItem(READING_STATE_STORAGE_KEY),
      )

      if (!envelope) {
        return []
      }

      return Object.values(envelope.positions).map((position) => ({
        bookId: bookId(position.bookId),
        chapterId: chapterId(position.chapterId),
        paragraphIndex: 0,
        chapterProgress: position.chapterProgress,
      }))
    } catch {
      return []
    }
  }
}
