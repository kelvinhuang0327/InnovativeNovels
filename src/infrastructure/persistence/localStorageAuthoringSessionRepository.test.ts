import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTHORING_SESSION_STORAGE_KEY,
  LocalStorageAuthoringSessionRepository,
} from './localStorageAuthoringSessionRepository'
import {
  READING_STATE_STORAGE_KEY,
} from './localStorageReadingStateRepository'

const session = {
  spec: {
    premise: '潮水每天提早一分鐘退去。',
    genre: '科幻懸疑',
    titleHint: '潮汐檔案',
    instructions: '保留線索。',
    requestedChapterCount: 3,
  },
  agentPrompt: 'Role: Novel Generation Agent',
  continuationPrompt: 'Role: Novel Continuation Agent',
  draft: {
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters: [
      {
        sequence: 1,
        title: '沉入海底的鐘',
        prose: ['海水覆過鐘面。'],
      },
    ],
    status: 'DRAFT' as const,
    quality: {
      status: 'WARNING' as const,
      hardFailures: [],
      warnings: [],
    },
  },
  publicationPreparation: {
    publicationSlug: 'tide-archive',
    authorName: '林澄',
    description: '潮汐帶回遺失的記憶。',
    catalogSequence: 13,
  },
  targetPublishedBookId: 'book-tide-archive',
  basePublishedBookFingerprint: 'base-fingerprint-v1',
  publishedAppendCandidate: {
    schemaVersion: 1 as const,
    readiness: 'READY' as const,
    targetPublishedBookId: 'book-tide-archive',
    bookId: 'book-tide-archive',
    baseFixtureFingerprint: 'base-fingerprint',
    draftFingerprint: 'draft-fingerprint',
    publishedChapterCount: 3,
    lastPublishedSequence: 3,
    appendedChapters: [
      {
        chapterId: 'chapter-tide-archive-004',
        sequence: 4,
        title: '鐘下的新頁',
        access: 'READABLE' as const,
        prose: ['第一段', '第二段'],
      },
    ],
    updatedFixturePreview: {
      schema: 'innovative-novels/content-book/v1' as const,
      bookId: 'book-tide-archive',
      catalogSequence: 13,
      title: '潮汐檔案',
      authorName: 'InnovativeNovels AI',
      categoryLabel: '科幻懸疑',
      description: '潮汐帶回遺失的記憶。',
      chapters: [
        {
          chapterId: 'chapter-tide-archive-004',
          sequence: 4,
          title: '鐘下的新頁',
          access: 'READABLE' as const,
          prose: ['第一段', '第二段'],
        },
      ],
    },
    quality: {
      status: 'PASS' as const,
      hardFailures: [],
      warnings: [],
    },
    warnings: [],
    validation: {
      status: 'PASS' as const,
      validator: 'production-content-fixture-v1' as const,
    },
  },
}

describe('LocalStorageAuthoringSessionRepository', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('saves and restores the minimum authoring session, including a valid Draft', () => {
    const repository = new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    )

    repository.save(session)

    const restored = repository.load()
    expect(restored?.spec).toEqual(session.spec)
    expect(restored?.agentPrompt).toBe(session.agentPrompt)
    expect(restored?.continuationPrompt).toBe(session.continuationPrompt)
    expect(restored?.draft?.title).toBe('潮汐檔案')
    expect(restored?.draft?.status).toBe('DRAFT')
    expect(restored?.draft?.quality).toBeDefined()
    expect(restored?.publicationPreparation).toEqual(
      session.publicationPreparation,
    )
    expect(restored?.targetPublishedBookId).toBe('book-tide-archive')
    expect(restored?.basePublishedBookFingerprint).toBe('base-fingerprint-v1')
    expect(restored?.publishedAppendCandidate?.appendedChapters).toHaveLength(1)
  })

  it('fails closed on a malformed append candidate without touching unrelated storage', () => {
    window.localStorage.setItem(
      AUTHORING_SESSION_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        spec: session.spec,
        targetPublishedBookId: 'book-tide-archive',
        publishedAppendCandidate: { schemaVersion: 99 },
      }),
    )
    window.localStorage.setItem(READING_STATE_STORAGE_KEY, 'reader-state')
    const repository = new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    )

    expect(repository.load()).toBeUndefined()
    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(READING_STATE_STORAGE_KEY)).toBe(
      'reader-state',
    )
  })

  it('fails closed on malformed stored JSON and leaves unrelated storage untouched', () => {
    window.localStorage.setItem(AUTHORING_SESSION_STORAGE_KEY, '{broken json')
    window.localStorage.setItem(READING_STATE_STORAGE_KEY, 'reader-state')
    const repository = new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    )

    expect(repository.load()).toBeUndefined()
    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(READING_STATE_STORAGE_KEY)).toBe(
      'reader-state',
    )
  })

  it('fails closed on unsupported versions', () => {
    window.localStorage.setItem(
      AUTHORING_SESSION_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, spec: session.spec }),
    )
    const repository = new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    )

    expect(repository.load()).toBeUndefined()
    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('clears only authoring session data', () => {
    window.localStorage.setItem(AUTHORING_SESSION_STORAGE_KEY, 'authoring')
    window.localStorage.setItem(READING_STATE_STORAGE_KEY, 'reader-state')
    const repository = new LocalStorageAuthoringSessionRepository(
      window.localStorage,
    )

    repository.clear()

    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(READING_STATE_STORAGE_KEY)).toBe(
      'reader-state',
    )
  })
})
