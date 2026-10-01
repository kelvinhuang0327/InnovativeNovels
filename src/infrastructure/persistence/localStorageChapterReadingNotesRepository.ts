import type { ChapterReadingNotesRepository } from '../../application/reading/chapterReadingNotesRepository'
import { bookId, chapterId } from '../../domain/catalog/identifiers'
import type { ChapterReadingNote } from '../../domain/reading/chapterReadingNote'

export const CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX =
  'innovative-novels:chapter-reading-note:v1:'

interface StoredChapterReadingNote {
  readonly bookId: string
  readonly chapterId: string
  readonly content: string
}

function noteStorageKey(bookIdValue: string, chapterIdValue: string): string {
  return `${CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX}${encodeURIComponent(bookIdValue)}:${encodeURIComponent(chapterIdValue)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseChapterReadingNote(
  serialized: string | null,
  requestedBookId: string,
  requestedChapterId: string,
): ChapterReadingNote | undefined {
  if (serialized === null) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)

    if (
      !isRecord(candidate) ||
      typeof candidate.bookId !== 'string' ||
      candidate.bookId.trim().length === 0 ||
      candidate.bookId !== requestedBookId ||
      typeof candidate.chapterId !== 'string' ||
      candidate.chapterId.trim().length === 0 ||
      candidate.chapterId !== requestedChapterId ||
      typeof candidate.content !== 'string' ||
      candidate.content.trim().length === 0
    ) {
      return undefined
    }

    return {
      bookId: bookId(candidate.bookId),
      chapterId: chapterId(candidate.chapterId),
      content: candidate.content,
    }
  } catch {
    return undefined
  }
}

export class LocalStorageChapterReadingNotesRepository
  implements ChapterReadingNotesRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  load(targetBookId: string, targetChapterId: string): ChapterReadingNote | undefined {
    try {
      return parseChapterReadingNote(
        this.storage.getItem(noteStorageKey(targetBookId, targetChapterId)),
        targetBookId,
        targetChapterId,
      )
    } catch {
      return undefined
    }
  }

  list(): readonly ChapterReadingNote[] {
    let storageLength: number

    try {
      storageLength = this.storage.length
    } catch {
      return []
    }

    const notes: ChapterReadingNote[] = []

    for (let index = 0; index < storageLength; index += 1) {
      let key: string | null

      try {
        key = this.storage.key(index)
      } catch {
        continue
      }

      if (!key?.startsWith(CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX)) {
        continue
      }

      const identity = key.slice(CHAPTER_READING_NOTES_STORAGE_KEY_PREFIX.length)
      const separator = identity.indexOf(':')

      if (separator < 1 || separator === identity.length - 1) {
        continue
      }

      try {
        const requestedBookId = decodeURIComponent(identity.slice(0, separator))
        const requestedChapterId = decodeURIComponent(identity.slice(separator + 1))
        const serialized = this.storage.getItem(key)
        const note = parseChapterReadingNote(
          serialized,
          requestedBookId,
          requestedChapterId,
        )

        if (note && key === noteStorageKey(note.bookId, note.chapterId)) {
          notes.push(note)
        }
      } catch {
        // A malformed key or an unreadable record does not hide other notes.
      }
    }

    return notes
  }

  save(note: ChapterReadingNote): void {
    if (note.content.trim().length === 0) {
      this.remove(note.bookId, note.chapterId)
      return
    }

    const storedNote: StoredChapterReadingNote = {
      bookId: note.bookId,
      chapterId: note.chapterId,
      content: note.content,
    }

    try {
      this.storage.setItem(
        noteStorageKey(note.bookId, note.chapterId),
        JSON.stringify(storedNote),
      )
    } catch {
      // Storage failures leave the chapter note unavailable.
    }
  }

  remove(targetBookId: string, targetChapterId: string): void {
    try {
      this.storage.removeItem(noteStorageKey(targetBookId, targetChapterId))
    } catch {
      // Storage failures leave the existing chapter note unchanged.
    }
  }
}
