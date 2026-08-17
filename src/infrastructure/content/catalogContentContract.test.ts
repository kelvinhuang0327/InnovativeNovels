import { describe, expect, it } from 'vitest'
import {
  CONTENT_BOOK_SCHEMA,
  ContentImportError,
  parseContentBookFixture,
} from './catalogContentContract'
import { loadProductionCatalogContent } from './catalogContentLoader'

function validFixture(overrides: Record<string, unknown> = {}) {
  return {
    schema: CONTENT_BOOK_SCHEMA,
    bookId: 'book-example',
    catalogSequence: 1,
    title: 'Example Title',
    authorName: 'Example Author',
    categoryLabel: 'Example Genre',
    description: 'Example description.',
    chapters: [
      {
        chapterId: 'chapter-one',
        sequence: 1,
        title: 'Chapter One',
        access: 'READABLE',
        prose: ['First paragraph.', 'Second paragraph.'],
      },
      {
        chapterId: 'chapter-two',
        sequence: 2,
        title: 'Chapter Two',
        access: 'LOCKED',
      },
    ],
    ...overrides,
  }
}

const FIXTURE_PATH = './books/book-example.json'
const MIN_READABLE_AVERAGE_PROSE_LENGTH = 500

describe('parseContentBookFixture', () => {
  it('parses a valid fixture, preserving chapter array order', () => {
    const parsed = parseContentBookFixture(FIXTURE_PATH, validFixture())

    expect(parsed.catalogSequence).toBe(1)
    expect(parsed.book.id).toBe('book-example')
    expect(parsed.chapters.map((entry) => entry.chapter.id)).toEqual([
      'chapter-one',
      'chapter-two',
    ])
    expect(parsed.chapters[0].prose).toEqual([
      'First paragraph.',
      'Second paragraph.',
    ])
    expect(parsed.chapters[1].prose).toBeUndefined()
  })

  it('accepts chapters authored out of ascending sequence order without reordering them', () => {
    const parsed = parseContentBookFixture(
      FIXTURE_PATH,
      validFixture({
        chapters: [
          {
            chapterId: 'chapter-three',
            sequence: 3,
            title: 'Chapter Three',
            access: 'LOCKED',
          },
          {
            chapterId: 'chapter-one',
            sequence: 1,
            title: 'Chapter One',
            access: 'READABLE',
            prose: ['Para.'],
          },
          {
            chapterId: 'chapter-two',
            sequence: 2,
            title: 'Chapter Two',
            access: 'READABLE',
            prose: ['Para.'],
          },
        ],
      }),
    )

    expect(parsed.chapters.map((entry) => entry.chapter.sequence)).toEqual([
      3, 1, 2,
    ])
  })

  it('accepts PREVIEW chapters that carry prose', () => {
    const parsed = parseContentBookFixture(
      FIXTURE_PATH,
      validFixture({
        chapters: [
          {
            chapterId: 'chapter-one',
            sequence: 1,
            title: 'Chapter One',
            access: 'PREVIEW',
            prose: ['Preview paragraph.'],
          },
        ],
      }),
    )

    expect(parsed.chapters[0].prose).toEqual(['Preview paragraph.'])
  })

  it('rejects a non-object root', () => {
    expect(() => parseContentBookFixture(FIXTURE_PATH, [])).toThrow(
      ContentImportError,
    )
    expect(() => parseContentBookFixture(FIXTURE_PATH, 'nope')).toThrow(
      ContentImportError,
    )
    expect(() => parseContentBookFixture(FIXTURE_PATH, null)).toThrow(
      ContentImportError,
    )
  })

  it('rejects an unrecognized schema marker', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({ schema: 'something-else' }),
      )
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ContentImportError)
      expect((error as ContentImportError).reason).toBe('UNKNOWN_SCHEMA')
      expect((error as ContentImportError).fixturePath).toBe(FIXTURE_PATH)
    }
  })

  it('rejects an unknown top-level key', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({ extraField: 'nope' }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('UNKNOWN_KEY')
      expect((error as ContentImportError).field).toBe('$.extraField')
    }
  })

  it('rejects an unknown chapter key', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'LOCKED',
              extra: true,
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('UNKNOWN_KEY')
    }
  })

  it('rejects a bookId that does not match the filename', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({ bookId: 'book-other' }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('FILENAME_MISMATCH')
    }
  })

  it('rejects a non-positive-integer catalogSequence', () => {
    for (const bad of [0, -1, 1.5, '1', null]) {
      expect(() =>
        parseContentBookFixture(
          FIXTURE_PATH,
          validFixture({ catalogSequence: bad }),
        ),
      ).toThrow(ContentImportError)
    }
  })

  it('rejects an empty chapters array', () => {
    expect(() =>
      parseContentBookFixture(FIXTURE_PATH, validFixture({ chapters: [] })),
    ).toThrow(ContentImportError)
  })

  it('rejects a non-positive-integer chapter sequence', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 0,
              title: 'Chapter One',
              access: 'LOCKED',
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('MALFORMED_VALUE')
    }
  })

  it('rejects duplicate chapter sequences within one book', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'LOCKED',
            },
            {
              chapterId: 'chapter-two',
              sequence: 1,
              title: 'Chapter Two',
              access: 'LOCKED',
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe(
        'DUPLICATE_CHAPTER_SEQUENCE',
      )
    }
  })

  it('rejects an accessible chapter with no prose', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'READABLE',
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe(
        'ACCESSIBLE_CHAPTER_MISSING_PROSE',
      )
    }
  })

  it('rejects an accessible chapter with an empty prose array', () => {
    expect(() =>
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'READABLE',
              prose: [],
            },
          ],
        }),
      ),
    ).toThrow(ContentImportError)
  })

  it('rejects an accessible chapter with a blank paragraph', () => {
    expect(() =>
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'READABLE',
              prose: ['   '],
            },
          ],
        }),
      ),
    ).toThrow(ContentImportError)
  })

  it('rejects a LOCKED chapter carrying prose', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'LOCKED',
              prose: ['Should not exist.'],
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe(
        'INACCESSIBLE_CHAPTER_HAS_PROSE',
      )
    }
  })

  it('rejects an UNAVAILABLE chapter carrying prose', () => {
    expect(() =>
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'UNAVAILABLE',
              prose: ['Should not exist.'],
            },
          ],
        }),
      ),
    ).toThrow(ContentImportError)
  })

  it('fails closed on an unrecognized access value', () => {
    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'SUPER_ADMIN',
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as ContentImportError).reason).toBe('UNKNOWN_ACCESS')
    }
  })

  it('never includes prose content in the error message', () => {
    const secretParagraph = 'THIS-PARAGRAPH-MUST-NEVER-LEAK-INTO-ERRORS'

    try {
      parseContentBookFixture(
        FIXTURE_PATH,
        validFixture({
          chapters: [
            {
              chapterId: 'chapter-one',
              sequence: 1,
              title: 'Chapter One',
              access: 'LOCKED',
              prose: [secretParagraph],
            },
          ],
        }),
      )
      expect.unreachable()
    } catch (error) {
      expect((error as Error).message).not.toContain(secretParagraph)
      expect((error as ContentImportError).fixturePath).toBe(FIXTURE_PATH)
      expect((error as ContentImportError).field).toContain('prose')
    }
  })

  it('requires every production book to maintain readable prose density', () => {
    const { books, proseByChapterId } = loadProductionCatalogContent()

    for (const entry of books) {
      const lengths = entry.chapters
        .filter((chapter) => chapter.access === 'READABLE')
        .map((chapter) => proseByChapterId.get(chapter.id)?.join('').length ?? 0)
      const total = lengths.reduce((sum, length) => sum + length, 0)
      const average = total / lengths.length

      expect(average, entry.book.id).toBeGreaterThanOrEqual(
        MIN_READABLE_AVERAGE_PROSE_LENGTH,
      )
    }
  })

  it('requires discovery books to have no stub-length readable chapters', () => {
    const { books, proseByChapterId } = loadProductionCatalogContent()
    const MIN_DISCOVERY_CHAPTER_PROSE_LENGTH = 800

    for (const entry of books) {
      if (
        entry.catalogSequence !== 1 &&
        entry.catalogSequence !== 2 &&
        entry.catalogSequence !== 3
      ) {
        continue
      }

      for (const chapter of entry.chapters) {
        if (chapter.access !== 'READABLE') {
          continue
        }

        const length =
          proseByChapterId.get(chapter.id)?.join('').length ?? 0

        expect(
          length,
          `${entry.book.id}:${chapter.id as string}`,
        ).toBeGreaterThanOrEqual(MIN_DISCOVERY_CHAPTER_PROSE_LENGTH)
      }
    }
  })
})
