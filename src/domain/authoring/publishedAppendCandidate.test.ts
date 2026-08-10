import { describe, expect, it } from 'vitest'
import {
  parseContentBookFixture,
} from '../../infrastructure/content/catalogContentContract'
import { loadProductionCatalogContent } from '../../infrastructure/content/catalogContentLoader'
import type { Draft, DraftChapter, GeneratedDraft } from './authoringContracts'
import { evaluateDraftQuality } from './qualityEvaluator'
import {
  buildPublishedAppendCandidate,
  createPublishedBookSnapshot,
  exportPublishedAppendCandidate,
  fingerprintPublishedBook,
  isPublishedAppendCandidateCurrent,
  type PublishedBookSnapshot,
} from './publishedAppendCandidate'

const fixturePath = './books/book-tide-archive.json'
const fixtureModules = import.meta.glob(
  '../../infrastructure/content/books/book-tide-archive.json',
  { eager: true, import: 'default' },
) as Record<string, unknown>
const rawFixture = fixtureModules[
  '../../infrastructure/content/books/book-tide-archive.json'
]
parseContentBookFixture(fixturePath, rawFixture)
const productionCatalog = loadProductionCatalogContent()
const targetEntry = productionCatalog.books.find(
  ({ book }) => book.id === 'book-tide-archive',
)

if (!targetEntry) {
  throw new Error('The live book-tide-archive fixture is required by this test.')
}

const publishedBook: PublishedBookSnapshot = createPublishedBookSnapshot(
  {
    book: {
      id: targetEntry.book.id as string,
      title: targetEntry.book.title,
      authorName: targetEntry.book.authorName,
      categoryLabel: targetEntry.book.categoryLabel,
    },
    catalogSequence: targetEntry.catalogSequence,
    description: targetEntry.description,
    chapters: targetEntry.chapters.slice(0, 3).map((chapter) => ({
      chapterId: chapter.id as string,
      sequence: chapter.sequence,
      title: chapter.title,
      access: chapter.access,
    })),
  },
  (chapterId) => productionCatalog.proseByChapterId.get(chapterId),
) as PublishedBookSnapshot

const allProductionChapterIds = productionCatalog.books.flatMap(({ book, chapters }) =>
  (book.id === 'book-tide-archive' ? chapters.slice(0, 3) : chapters).map(
    (chapter) => chapter.id as string,
  ),
)

const validator = (fixture: Parameters<typeof parseContentBookFixture>[1]) => {
  parseContentBookFixture(fixturePath, fixture)
}

const appendedProse = (chapter: number): readonly string[] => [
  `第${chapter}章第一段。`,
  `第${chapter}章第二段。`,
  `第${chapter}章第三段。`,
  `第${chapter}章第四段。`,
  `第${chapter}章第五段。`,
]

function makeDraft(
  chapters: readonly DraftChapter[] = [
    ...publishedBook.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: [...(chapter.prose ?? [])],
    })),
    { sequence: 4, title: '鐘下的新頁', prose: appendedProse(4) },
    { sequence: 5, title: '潮水回來以前', prose: appendedProse(5) },
  ],
  overrides: Partial<GeneratedDraft> = {},
): Draft {
  const generated: GeneratedDraft = {
    title: publishedBook.title,
    categoryLabel: publishedBook.categoryLabel,
    chapters,
    ...overrides,
  }
  return {
    ...generated,
    status: 'DRAFT',
    quality: evaluateDraftQuality(generated),
  }
}

async function build(
  draft: Draft,
  overrides: Partial<Parameters<typeof buildPublishedAppendCandidate>[0]> = {},
) {
  return buildPublishedAppendCandidate({
    draft,
    targetPublishedBookId: 'book-tide-archive',
    publishedBook,
    allProductionChapterIds,
    validateProductionFixture: validator,
    ...overrides,
  })
}

describe('published append candidate', () => {
  it('accepts a reviewed 3→5 Draft with deterministic identity and a real fixture preview', async () => {
    const first = await build(makeDraft())
    const second = await build(makeDraft())

    expect(first.readiness).toBe('READY')
    expect(first.validation.status).toBe('PASS')
    expect(first.baseFixtureFingerprint).toBe(
      await fingerprintPublishedBook(publishedBook),
    )
    expect(first.baseFixtureFingerprint).toBe(second.baseFixtureFingerprint)
    expect(first.candidate).toEqual(second.candidate)
    expect(first.candidate).toMatchObject({
      targetPublishedBookId: 'book-tide-archive',
      bookId: 'book-tide-archive',
      publishedChapterCount: 3,
      lastPublishedSequence: 3,
      updatedFixturePreview: {
        bookId: 'book-tide-archive',
        catalogSequence: 13,
        title: '潮汐檔案',
        categoryLabel: '科幻懸疑',
      },
    })
    expect(first.candidate?.appendedChapters).toEqual([
      {
        chapterId: 'chapter-tide-archive-004',
        sequence: 4,
        title: '鐘下的新頁',
        access: 'READABLE',
        prose: appendedProse(4),
      },
      {
        chapterId: 'chapter-tide-archive-005',
        sequence: 5,
        title: '潮水回來以前',
        access: 'READABLE',
        prose: appendedProse(5),
      },
    ])
    expect(first.candidate?.updatedFixturePreview.chapters.map((chapter) => chapter.chapterId)).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
    ])
    expect(
      first.candidate?.updatedFixturePreview.chapters
        .slice(0, 3)
        .map((chapter) => chapter.access),
    ).toEqual(publishedBook.chapters.map((chapter) => chapter.access))
    expect(exportPublishedAppendCandidate(first.candidate!)).toBe(
      exportPublishedAppendCandidate(second.candidate!),
    )
    expect(
      await isPublishedAppendCandidateCurrent(
        first.candidate!,
        makeDraft(),
        'book-tide-archive',
        publishedBook,
      ),
    ).toBe(true)
  })

  it.each([
    ['no new chapter', makeDraft(publishedBook.chapters.map((chapter) => ({ sequence: chapter.sequence, title: chapter.title, prose: [...(chapter.prose ?? [])] }))), 'NO_NEW_CHAPTER'],
    ['shorter Draft', makeDraft(publishedBook.chapters.slice(0, 2).map((chapter) => ({ sequence: chapter.sequence, title: chapter.title, prose: [...(chapter.prose ?? [])] }))), 'DRAFT_SHORTER_THAN_PUBLISHED'],
    ['changed published title', makeDraft(makeDraft().chapters.map((chapter, index) => index === 0 ? { ...chapter, title: '被改寫的舊章' } : chapter)), 'PUBLISHED_CHAPTER_CHANGED'],
    ['changed published prose', makeDraft(makeDraft().chapters.map((chapter, index) => index === 0 ? { ...chapter, prose: ['被改寫的舊正文'] } : chapter)), 'PUBLISHED_CHAPTER_CHANGED'],
    ['reordered published chapters', makeDraft([makeDraft().chapters[1], makeDraft().chapters[0], ...makeDraft().chapters.slice(2)]), 'DRAFT_SEQUENCE_INVALID'],
    ['append sequence gap', makeDraft(makeDraft().chapters.map((chapter, index) => index === 3 ? { ...chapter, sequence: 6 } : chapter)), 'DRAFT_SEQUENCE_INVALID'],
    ['duplicate append sequence', makeDraft(makeDraft().chapters.map((chapter, index) => index === 4 ? { ...chapter, sequence: 4 } : chapter)), 'DRAFT_SEQUENCE_INVALID'],
    ['empty appended prose', makeDraft(makeDraft().chapters.map((chapter, index) => index === 3 ? { ...chapter, prose: [] } : chapter)), 'APPENDED_CHAPTER_PROSE_REQUIRED'],
    ['title mismatch', makeDraft(makeDraft().chapters, { title: '不同標題' }), 'TITLE_MISMATCH'],
    ['genre mismatch', makeDraft(makeDraft().chapters, { categoryLabel: '不同分類' }), 'GENRE_MISMATCH'],
    ['wrong target BookId', makeDraft(), 'TARGET_BOOK_NOT_FOUND'],
  ])('blocks %s', async (name, draft, expectedCode) => {
    const overrides = name === 'wrong target BookId'
      ? { targetPublishedBookId: 'book-not-in-production', publishedBook: undefined }
      : {}
    const result = await build(draft, overrides)

    expect(result.readiness).toBe('BLOCKED')
    expect(result.issues.map((item) => item.code)).toContain(expectedCode)
    expect(result.candidate).toBeUndefined()
  })

  it('blocks stale quality and candidate collisions without changing the production snapshot', async () => {
    const baseline = makeDraft()
    const staleDraft: Draft = {
      ...baseline,
      chapters: baseline.chapters.map((chapter, index) =>
        index === 3 ? { ...chapter, prose: [] } : chapter,
      ),
    }
    const before = JSON.stringify(publishedBook)
    const staleResult = await build(staleDraft)
    const collisionResult = await build(baseline, {
      allProductionChapterIds: [...allProductionChapterIds, 'chapter-tide-archive-004'],
    })

    expect(staleResult.issues.map((item) => item.code)).toContain('QUALITY_STALE')
    expect(collisionResult.issues.map((item) => item.code)).toContain('CHAPTER_ID_COLLISION')
    expect(JSON.stringify(publishedBook)).toBe(before)
    expect(productionCatalog.books).toHaveLength(13)
  })

  it('invalidates a prepared candidate when the Draft, target, or production base changes', async () => {
    const result = await build(makeDraft())
    const candidate = result.candidate!
    const changedDraft = makeDraft(
      makeDraft().chapters.map((chapter, index) =>
        index === 3 ? { ...chapter, prose: ['changed appended prose'] } : chapter,
      ),
    )
    const changedProduction = {
      ...publishedBook,
      chapters: publishedBook.chapters.map((chapter, index) =>
        index === 0 ? { ...chapter, title: 'production changed' } : chapter,
      ),
    }

    await expect(
      isPublishedAppendCandidateCurrent(
        candidate,
        changedDraft,
        'book-tide-archive',
        publishedBook,
      ),
    ).resolves.toBe(false)
    await expect(
      isPublishedAppendCandidateCurrent(
        candidate,
        makeDraft(),
        'book-other',
        publishedBook,
      ),
    ).resolves.toBe(false)
    await expect(
      isPublishedAppendCandidateCurrent(
        candidate,
        makeDraft(),
        'book-tide-archive',
        changedProduction,
      ),
    ).resolves.toBe(false)
  })
})
