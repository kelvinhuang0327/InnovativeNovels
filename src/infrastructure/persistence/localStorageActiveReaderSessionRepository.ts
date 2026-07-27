import type { ActiveReaderSessionRepository } from '../../application/reading/activeReaderSessionRepository'

export const ACTIVE_READER_SESSION_STORAGE_KEY =
  'innovative-novels:active-reader-session:v1'

interface ActiveReaderSessionEnvelope {
  readonly schemaVersion: 1
  readonly activeBookId: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEnvelope(
  serialized: string | null,
): ActiveReaderSessionEnvelope | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      candidate.schemaVersion !== 1 ||
      typeof candidate.activeBookId !== 'string' ||
      candidate.activeBookId.trim().length === 0
    ) {
      return undefined
    }

    return { schemaVersion: 1, activeBookId: candidate.activeBookId }
  } catch {
    return undefined
  }
}

export class LocalStorageActiveReaderSessionRepository
  implements ActiveReaderSessionRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  load(): string | undefined {
    try {
      const raw = this.storage.getItem(ACTIVE_READER_SESSION_STORAGE_KEY)
      const envelope = parseEnvelope(raw)

      if (!envelope) {
        if (raw !== null) {
          this.clear()
        }
        return undefined
      }

      return envelope.activeBookId
    } catch {
      return undefined
    }
  }

  save(bookId: string): void {
    try {
      const envelope: ActiveReaderSessionEnvelope = {
        schemaVersion: 1,
        activeBookId: bookId,
      }
      this.storage.setItem(
        ACTIVE_READER_SESSION_STORAGE_KEY,
        JSON.stringify(envelope),
      )
    } catch {
      // Persistence failures leave the reader usable without recovery.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(ACTIVE_READER_SESSION_STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
