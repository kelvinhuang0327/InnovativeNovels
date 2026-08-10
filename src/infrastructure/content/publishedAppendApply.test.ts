import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from '../../domain/access/chapterAccess'
import type { ContentBookFixtureV1 } from '../../domain/catalog/contentBookFixture'
import type { Draft, DraftChapter } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import {
  buildPublishedAppendCandidate,
  createPublishedBookSnapshot,
  fingerprintPublishedBook,
  type PublishedAppendCandidate,
} from '../../domain/authoring/publishedAppendCandidate'
import { loadProductionCatalogContent } from './catalogContentLoader'
import { parseContentBookFixture } from './catalogContentContract'
import {
  applyPublishedAppendCandidate,
  type PublishedAppendApplyResult,
} from './publishedAppendApply'

const TARGET_FILE_NAME = 'book-tide-archive.json'

const BASE_FIXTURE: ContentBookFixtureV1 = {
  schema: 'innovative-novels/content-book/v1',
  bookId: 'book-tide-archive',
  catalogSequence: 1,
  title: '測試潮汐檔案',
  authorName: '測試作者',
  categoryLabel: '測試分類',
  description: '只供隔離 append 機制測試使用。',
  chapters: [
    {
      chapterId: 'chapter-tide-archive-001',
      sequence: 1,
      title: '第一章',
      access: CHAPTER_ACCESS.READABLE,
      prose: ['第一章正文。'],
    },
    {
      chapterId: 'chapter-tide-archive-002',
      sequence: 2,
      title: '第二章',
      access: CHAPTER_ACCESS.READABLE,
      prose: ['第二章正文。'],
    },
    {
      chapterId: 'chapter-tide-archive-003',
      sequence: 3,
      title: '第三章',
      access: CHAPTER_ACCESS.READABLE,
      prose: ['第三章正文。'],
    },
  ],
}

const APPENDED_CHAPTERS: readonly DraftChapter[] = [
  {
    sequence: 4,
    title: '第四章',
    prose: ['第四章第一段。', '第四章第二段。'],
  },
  {
    sequence: 5,
    title: '第五章',
    prose: ['第五章第一段。', '第五章第二段。'],
  },
]

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function publishedBookFromFixture(fixture: ContentBookFixtureV1) {
  const parsed = parseContentBookFixture(`./books/${TARGET_FILE_NAME}`, fixture)
  const proseByChapterId = new Map(
    parsed.chapters.map(({ chapter, prose }) => [chapter.id as string, prose]),
  )
  const snapshot = createPublishedBookSnapshot(
    {
      book: {
        id: parsed.book.id as string,
        title: parsed.book.title,
        authorName: parsed.book.authorName,
        categoryLabel: parsed.book.categoryLabel,
      },
      catalogSequence: parsed.catalogSequence,
      description: parsed.description,
      chapters: parsed.chapters.map(({ chapter }) => ({
        chapterId: chapter.id as string,
        sequence: chapter.sequence,
        title: chapter.title,
        access: chapter.access,
      })),
    },
    (chapterId) => proseByChapterId.get(chapterId),
  )

  if (!snapshot) {
    throw new Error('The test fixture must produce a published book snapshot.')
  }

  return snapshot
}

async function buildCandidate(
  fixture: ContentBookFixtureV1 = BASE_FIXTURE,
): Promise<PublishedAppendCandidate> {
  const publishedBook = publishedBookFromFixture(fixture)
  const draftChapters: readonly DraftChapter[] = [
    ...publishedBook.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: [...(chapter.prose ?? [])],
    })),
    ...APPENDED_CHAPTERS,
  ]
  const draft: Draft = {
    status: 'DRAFT',
    title: publishedBook.title,
    categoryLabel: publishedBook.categoryLabel,
    chapters: draftChapters,
    quality: evaluateDraftQuality({
      title: publishedBook.title,
      categoryLabel: publishedBook.categoryLabel,
      chapters: draftChapters,
    }),
  }
  const result = await buildPublishedAppendCandidate({
    draft,
    targetPublishedBookId: publishedBook.bookId,
    publishedBook,
    allProductionChapterIds: publishedBook.chapters.map(
      (chapter) => chapter.chapterId,
    ),
    validateProductionFixture: (candidateFixture) => {
      parseContentBookFixture(`./books/${TARGET_FILE_NAME}`, candidateFixture)
    },
  })

  if (!result.candidate) {
    throw new Error(`Test candidate was not ready: ${JSON.stringify(result)}`)
  }

  return result.candidate
}

async function createFixtureRoot(
  extraFixtures: readonly ContentBookFixtureV1[] = [],
): Promise<{ root: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), 'innovative-novels-append-'))
  const fixtures = [BASE_FIXTURE, ...extraFixtures]
  await Promise.all(
    fixtures.map((fixture) =>
      writeFile(
        join(root, `${fixture.bookId}.json`),
        `${JSON.stringify(fixture, null, 2)}\n`,
        'utf8',
      ),
    ),
  )
  return { root, target: join(root, TARGET_FILE_NAME) }
}

async function apply(
  root: string,
  target: string,
  candidate: unknown,
  mode: 'dry-run' | 'apply' = 'dry-run',
  validateProductionFixture?: Parameters<
    typeof applyPublishedAppendCandidate
  >[0]['validateProductionFixture'],
): Promise<PublishedAppendApplyResult> {
  return applyPublishedAppendCandidate({
    candidateSerialized: JSON.stringify(candidate),
    fixtureRoot: root,
    targetFixturePath: target,
    mode,
    validateProductionFixture,
  })
}

async function expectUnchanged(
  target: string,
  before: string,
  result: PublishedAppendApplyResult,
) {
  expect(result.ok).toBe(false)
  expect(await readFile(target, 'utf8')).toBe(before)
}

describe('published append apply mechanism', () => {
  it('passes a valid dry-run and performs zero filesystem mutation', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, candidate)

      expect(result).toEqual({
        ok: true,
        mode: 'dry-run',
        targetFixturePath: target,
        targetBookId: 'book-tide-archive',
        currentBaseFingerprint: candidate.baseFixtureFingerprint,
        appendedSequences: [4, 5],
        resultingChapterCount: 5,
        validation: 'PASS',
        applyAllowed: true,
        filesystemMutation: 'NONE',
      })
      expect(await readFile(target, 'utf8')).toBe(before)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('applies to an isolated fixture and preserves existing metadata and chapter bytes', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const before = JSON.parse(await readFile(target, 'utf8')) as ContentBookFixtureV1
      const result = await apply(root, target, candidate, 'apply')
      const after = JSON.parse(await readFile(target, 'utf8')) as ContentBookFixtureV1

      expect(result).toMatchObject({
        ok: true,
        mode: 'apply',
        appendedSequences: [4, 5],
        resultingChapterCount: 5,
        filesystemMutation: 'ATOMIC_REPLACE',
      })
      expect(after).toMatchObject({
        schema: before.schema,
        bookId: before.bookId,
        catalogSequence: before.catalogSequence,
        title: before.title,
        authorName: before.authorName,
        categoryLabel: before.categoryLabel,
        description: before.description,
      })
      expect(after.chapters.slice(0, 3)).toEqual(before.chapters)
      expect(after.chapters.slice(3).map(({ sequence }) => sequence)).toEqual([4, 5])
      expect(after.chapters.slice(3).map(({ chapterId }) => chapterId)).toEqual([
        'chapter-tide-archive-004',
        'chapter-tide-archive-005',
      ])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a wrong target and leaves the target unchanged', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const wrongTarget = {
        ...clone(candidate),
        targetPublishedBookId: 'book-other',
        bookId: 'book-other',
      }
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, wrongTarget)

      expect(result).toMatchObject({ ok: false, code: 'TARGET_MISMATCH' })
      await expectUnchanged(target, before, result)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a stale base fingerprint before any replacement', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const staleCandidate = {
        ...clone(candidate),
        baseFixtureFingerprint: '0'.repeat(64),
      }
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, staleCandidate)

      expect(result).toMatchObject({ ok: false, code: 'BASE_CHANGED' })
      await expectUnchanged(target, before, result)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a stale candidate base preview even when its fingerprint matches', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const stalePreview = {
        ...clone(candidate),
        updatedFixturePreview: {
          ...clone(candidate.updatedFixturePreview),
          title: '不同的既有標題',
        },
      }
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, stalePreview)

      expect(result).toMatchObject({ ok: false, code: 'BASE_CONTENT_MISMATCH' })
      await expectUnchanged(target, before, result)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a ChapterId collision without suffixing or overwriting', async () => {
    const collisionFixture: ContentBookFixtureV1 = {
      schema: 'innovative-novels/content-book/v1',
      bookId: 'book-other',
      catalogSequence: 2,
      title: '其他書',
      authorName: '測試作者',
      categoryLabel: '測試分類',
      description: '碰撞測試。',
      chapters: [
        {
          chapterId: 'chapter-tide-archive-004',
          sequence: 1,
          title: '碰撞章節',
          access: CHAPTER_ACCESS.READABLE,
          prose: ['碰撞正文。'],
        },
      ],
    }
    const { root, target } = await createFixtureRoot([collisionFixture])
    try {
      const candidate = await buildCandidate()
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, candidate)

      expect(result).toMatchObject({ ok: false, code: 'CHAPTER_ID_COLLISION' })
      await expectUnchanged(target, before, result)
      expect(await readFile(join(root, 'book-other.json'), 'utf8')).toContain(
        'chapter-tide-archive-004',
      )
      expect(await readFile(join(root, 'book-tide-archive-004.json'), 'utf8').catch(() => '')).toBe('')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses discontinuous sequences and invalid appended prose atomically', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const discontinuous = {
        ...clone(candidate),
        appendedChapters: clone(candidate.appendedChapters).map((chapter, index) =>
          index === 0 ? { ...chapter, sequence: 6 } : chapter,
        ),
        updatedFixturePreview: {
          ...clone(candidate.updatedFixturePreview),
          chapters: clone(candidate.updatedFixturePreview.chapters).map((chapter, index) =>
            index === 3 ? { ...chapter, sequence: 6 } : chapter,
          ),
        },
      }
      const before = await readFile(target, 'utf8')
      const sequenceResult = await apply(root, target, discontinuous)
      expect(sequenceResult).toMatchObject({ ok: false, code: 'APPEND_SEQUENCE_INVALID' })
      await expectUnchanged(target, before, sequenceResult)

      const invalidProse = {
        ...clone(candidate),
        appendedChapters: clone(candidate.appendedChapters).map((chapter, index) =>
          index === 0 ? { ...chapter, prose: ['   '] } : chapter,
        ),
        updatedFixturePreview: {
          ...clone(candidate.updatedFixturePreview),
          chapters: clone(candidate.updatedFixturePreview.chapters).map((chapter, index) =>
            index === 3 ? { ...chapter, prose: ['   '] } : chapter,
          ),
        },
      }
      const proseResult = await apply(root, target, invalidProse)
      expect(proseResult).toMatchObject({ ok: false, code: 'INVALID_APPENDED_CHAPTER' })
      await expectUnchanged(target, before, proseResult)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each([
    ['readiness BLOCKED', { readiness: 'BLOCKED' }],
    ['malformed candidate', { schemaVersion: 99 }],
  ])('refuses %s before touching the target', async (_label, override) => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const invalidCandidate = { ...clone(candidate), ...override }
      const before = await readFile(target, 'utf8')
      const result = await apply(root, target, invalidCandidate)

      expect(result).toMatchObject({ ok: false, code: 'MALFORMED_CANDIDATE' })
      await expectUnchanged(target, before, result)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses a production-validator failure without replacing the target', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const before = await readFile(target, 'utf8')
      const result = await apply(
        root,
        target,
        candidate,
        'apply',
        () => {
          throw new Error('synthetic validator failure')
        },
      )

      expect(result).toMatchObject({
        ok: false,
        code: 'PRODUCTION_VALIDATION_FAILED',
      })
      await expectUnchanged(target, before, result)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('refuses the same candidate after a successful apply', async () => {
    const { root, target } = await createFixtureRoot()
    try {
      const candidate = await buildCandidate()
      const first = await apply(root, target, candidate, 'apply')
      const afterFirst = await readFile(target, 'utf8')
      const second = await apply(root, target, candidate, 'apply')

      expect(first).toMatchObject({ ok: true, filesystemMutation: 'ATOMIC_REPLACE' })
      expect(second).toMatchObject({ ok: false, code: 'BASE_CHANGED' })
      expect(await readFile(target, 'utf8')).toBe(afterFirst)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('checks the real production base without synthetic chapter prose', async () => {
    const productionRoot = join(process.cwd(), 'src/infrastructure/content/books')
    const target = join(productionRoot, TARGET_FILE_NAME)
    const raw = JSON.parse(await readFile(target, 'utf8')) as ContentBookFixtureV1
    const snapshot = publishedBookFromFixture(raw)
    const baseFixtureFingerprint = await fingerprintPublishedBook(snapshot)
    const guardOnlyCandidate = {
      schemaVersion: 1,
      readiness: 'READY',
      targetPublishedBookId: raw.bookId,
      bookId: raw.bookId,
      baseFixtureFingerprint,
      draftFingerprint: 'guard-only',
      publishedChapterCount: raw.chapters.length,
      lastPublishedSequence: raw.chapters[raw.chapters.length - 1].sequence,
      appendedChapters: [],
      updatedFixturePreview: raw,
      quality: { status: 'PASS', hardFailures: [], warnings: [] },
      warnings: [],
      validation: { status: 'PASS', validator: 'production-content-fixture-v1' },
    }
    const before = await readFile(target, 'utf8')
    const result = await apply(
      productionRoot,
      target,
      guardOnlyCandidate,
      'dry-run',
    )

    expect(result).toMatchObject({ ok: false, code: 'NO_APPENDED_CHAPTERS' })
    expect(await readFile(target, 'utf8')).toBe(before)
    expect(loadProductionCatalogContent().books).toHaveLength(13)
  })
})
