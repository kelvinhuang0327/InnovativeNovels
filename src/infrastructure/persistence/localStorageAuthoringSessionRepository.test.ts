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
    expect(restored?.draft?.title).toBe('潮汐檔案')
    expect(restored?.draft?.status).toBe('DRAFT')
    expect(restored?.draft?.quality).toBeDefined()
    expect(restored?.publicationPreparation).toEqual(
      session.publicationPreparation,
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
