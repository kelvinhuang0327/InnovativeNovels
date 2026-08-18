import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../access/chapterAccess'
import { parseContentBookFixture } from '../../infrastructure/content/catalogContentContract'
import { loadProductionCatalogContent } from '../../infrastructure/content/catalogContentLoader'
import type { Draft, GeneratedDraft } from './authoringContracts'
import { evaluateDraftQuality } from './qualityEvaluator'
import {
  buildPublicationCandidate,
  normalizePublicationSlug,
  type PublicationPreparationMetadata,
} from './publicationCandidate'

const metadata: PublicationPreparationMetadata = {
  publicationSlug: 'tide-archive',
  authorName: 'InnovativeNovels AI',
  description:
    '臨海城的鐘塔在凌晨三點十七分同時停擺，氣象局員林澄循著失蹤哥哥的訊息進入舊港鐘樓，發現城市正被一座能記錄未來的潮汐裝置拖向時間線重合的覆滅危機。',
  catalogSequence: 13,
}

const tideArchiveFixtureModules = import.meta.glob(
  '../../infrastructure/content/books/book-tide-archive.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>
const parsedTideArchive = parseContentBookFixture(
  './books/book-tide-archive.json',
  tideArchiveFixtureModules[
    '../../infrastructure/content/books/book-tide-archive.json'
  ],
)

const draftShape: GeneratedDraft = {
  title: parsedTideArchive.book.title,
  categoryLabel: parsedTideArchive.book.categoryLabel,
  chapters: parsedTideArchive.chapters.map(({ chapter, prose }) => ({
    sequence: chapter.sequence,
    title: chapter.title,
    prose: prose ?? [],
  })),
}

function draft(overrides: Partial<GeneratedDraft> = {}): Draft {
  const generated = { ...draftShape, ...overrides }
  return {
    ...generated,
    status: 'DRAFT',
    quality: evaluateDraftQuality(generated),
  }
}

describe('publication candidate builder', () => {
  it('accepts a valid slug and generates deterministic production identity', () => {
    const first = buildPublicationCandidate(draft(), metadata)
    const second = buildPublicationCandidate(draft(), metadata)

    expect(normalizePublicationSlug(' tide-archive ')).toBe('tide-archive')
    expect(first.readiness).toBe('READY')
    expect(first.bookId).toBe('book-tide-archive')
    expect(first.chapterIds).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
      'chapter-tide-archive-006',
      'chapter-tide-archive-007',
      'chapter-tide-archive-008',
      'chapter-tide-archive-009',
      'chapter-tide-archive-010',
    ])
    expect(first.candidate).toEqual(second.candidate)
  })

  it.each(['Tide-Archive', 'tide_archive', 'tide archive', '潮汐檔案'])(
    'rejects invalid slug characters: %s',
    (publicationSlug) => {
      const result = buildPublicationCandidate(draft(), {
        ...metadata,
        publicationSlug,
      })

      expect(result.readiness).toBe('BLOCKED')
      expect(result.issues.map((item) => item.code)).toContain(
        'PUBLICATION_SLUG_INVALID',
      )
    },
  )

  it.each(['-tide-archive', 'tide-archive-'])('rejects leading/trailing hyphen: %s', (publicationSlug) => {
    const result = buildPublicationCandidate(draft(), {
      ...metadata,
      publicationSlug,
    })

    expect(result.readiness).toBe('BLOCKED')
    expect(result.issues.map((item) => item.code)).toContain(
      'PUBLICATION_SLUG_INVALID',
    )
  })

  it('blocks a BookId collision without an automatic suffix', () => {
    const result = buildPublicationCandidate(draft(), metadata, [
      { bookId: 'book-tide-archive', chapterIds: [] },
    ])

    expect(result.readiness).toBe('BLOCKED')
    expect(result.bookId).toBe('book-tide-archive')
    expect(result.issues.map((item) => item.code)).toContain('BOOK_ID_COLLISION')
    expect(result.bookId).not.toMatch(/-\d+$/)
  })

  it('blocks generated ChapterId collisions without changing the IDs', () => {
    const result = buildPublicationCandidate(draft(), metadata, [
      {
        bookId: 'book-existing',
        chapterIds: ['chapter-tide-archive-002'],
      },
    ])

    expect(result.readiness).toBe('BLOCKED')
    expect(result.chapterIds).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
      'chapter-tide-archive-006',
      'chapter-tide-archive-007',
      'chapter-tide-archive-008',
      'chapter-tide-archive-009',
      'chapter-tide-archive-010',
    ])
    expect(result.issues.map((item) => item.code)).toContain(
      'CHAPTER_ID_COLLISION',
    )
  })

  it('rebuilds identity from the changed slug and final reordered chapter sequence', () => {
    const reordered = draft({
      chapters: [draftShape.chapters[2], draftShape.chapters[0], draftShape.chapters[1]],
    })
    const changedSlug = buildPublicationCandidate(draft(), {
      ...metadata,
      publicationSlug: 'different-archive',
    })
    const rebuilt = buildPublicationCandidate(reordered, metadata)

    expect(changedSlug.bookId).toBe('book-different-archive')
    expect(changedSlug.candidate?.chapters[0].chapterId).toBe(
      'chapter-different-archive-001',
    )
    expect(rebuilt.candidate?.chapters.map((chapter) => chapter.title)).toEqual([
      '第四點整',
      '沉入海底的鐘',
      '舊港的回聲',
    ])
    expect(rebuilt.candidate?.chapters.map((chapter) => chapter.chapterId)).toEqual(
      [
        'chapter-tide-archive-001',
        'chapter-tide-archive-002',
        'chapter-tide-archive-003',
      ],
    )
  })

  it('maps every valid authored chapter to READABLE and rejects empty prose', () => {
    const ready = buildPublicationCandidate(draft(), metadata)
    expect(ready.candidate?.chapters.map((chapter) => chapter.access)).toEqual([
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
      CHAPTER_ACCESS.READABLE,
    ])

    const invalid = buildPublicationCandidate(
      draft({
        chapters: [{ sequence: 1, title: '空白章', prose: [] }],
      }),
      metadata,
    )
    expect(invalid.readiness).toBe('BLOCKED')
    expect(invalid.candidate).toBeUndefined()
    expect(invalid.issues.map((item) => item.code)).toContain('DRAFT_INVALID')
    expect(invalid.issues.map((item) => item.message).join(' ')).not.toContain(
      'LOCKED',
    )
  })

  it('produces the 潮汐檔案 candidate accepted by the real production validator', () => {
    const result = buildPublicationCandidate(draft(), metadata)

    expect(result.candidate).toBeDefined()
    expect(result.candidate).toMatchObject({
      bookId: 'book-tide-archive',
      catalogSequence: 13,
      title: '潮汐檔案',
      authorName: 'InnovativeNovels AI',
      categoryLabel: '科幻懸疑',
      description: metadata.description,
    })
    expect(result.candidate?.chapters.map((chapter) => chapter.prose?.length)).toEqual([
      14,
      16,
      11,
      52,
      61,
      10,
      10,
      12,
      12,
      13,
    ])
    expect(() =>
      parseContentBookFixture(
        './books/book-tide-archive.json',
        result.candidate,
      ),
    ).not.toThrow()
  })

  it('refuses to overwrite the published full-source fixture', () => {
    const productionCatalog = loadProductionCatalogContent().books.map(
      ({ book, chapters }) => ({
        bookId: book.id as string,
        chapterIds: chapters.map((chapter) => chapter.id as string),
      }),
    )
    const result = buildPublicationCandidate(draft(), metadata, productionCatalog)

    expect(result.readiness).toBe('BLOCKED')
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(['BOOK_ID_COLLISION', 'CHAPTER_ID_COLLISION']),
    )
  })

  it('does not mutate or discover the candidate in the existing production catalog', () => {
    const before = loadProductionCatalogContent()
    const result = buildPublicationCandidate(draft(), {
      ...metadata,
      publicationSlug: 'new-archive',
      catalogSequence: 14,
    })
    const after = loadProductionCatalogContent()

    expect(result.candidate?.bookId).toBe('book-new-archive')
    expect(after.books).toEqual(before.books)
    expect(after.books.flatMap(({ chapters }) => chapters.map((chapter) => chapter.access))).toEqual(
      before.books.flatMap(({ chapters }) => chapters.map((chapter) => chapter.access)),
    )
  })
})
