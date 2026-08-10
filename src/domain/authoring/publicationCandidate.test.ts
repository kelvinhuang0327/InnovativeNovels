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
  authorName: '林澄',
  description: '當潮汐帶回遺失的記憶，一名守燈人追查城市的空白。',
  catalogSequence: 13,
}

const draftShape: GeneratedDraft = {
  title: '潮汐檔案',
  categoryLabel: '科幻懸疑',
  chapters: [
    { sequence: 1, title: '沉入海底的鐘', prose: ['第一段。', '第二段。'] },
    { sequence: 2, title: '舊港的回聲', prose: ['第三段。', '第四段。'] },
    { sequence: 3, title: '第四點整', prose: ['第五段。', '第六段。'] },
  ],
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
    expect(first.readiness).toBe('READY_WITH_WARNINGS')
    expect(first.bookId).toBe('book-tide-archive')
    expect(first.chapterIds).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
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
    ])
    expect(result.issues.map((item) => item.code)).toContain(
      'CHAPTER_ID_COLLISION',
    )
  })

  it('rebuilds identity from the changed slug and final reordered chapter sequence', () => {
    const reordered = draft({
      chapters: [draftShape.chapters[2], draftShape.chapters[0], draftShape.chapters[1]],
    })
    const original = buildPublicationCandidate(draft(), metadata)
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
      original.candidate?.chapters.map((chapter) => chapter.chapterId),
    )
  })

  it('maps every valid authored chapter to READABLE and rejects empty prose', () => {
    const ready = buildPublicationCandidate(draft(), metadata)
    expect(ready.candidate?.chapters.map((chapter) => chapter.access)).toEqual([
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
    expect(() =>
      parseContentBookFixture(
        './books/book-tide-archive.json',
        result.candidate,
      ),
    ).not.toThrow()
  })

  it('does not mutate or discover the candidate in the existing production catalog', () => {
    const before = loadProductionCatalogContent()
    const result = buildPublicationCandidate(draft(), metadata)
    const after = loadProductionCatalogContent()

    expect(result.candidate?.bookId).toBe('book-tide-archive')
    expect(after.books.map(({ book }) => book.id)).not.toContain(
      'book-tide-archive',
    )
    expect(after.books).toEqual(before.books)
    expect(after.books.flatMap(({ chapters }) => chapters.map((chapter) => chapter.access))).toEqual(
      before.books.flatMap(({ chapters }) => chapters.map((chapter) => chapter.access)),
    )
  })
})
