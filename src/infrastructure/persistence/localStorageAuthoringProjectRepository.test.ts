import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthoringSession } from '../../application/authoring/authoringSessionRepository'
import { createEmptyAuthoringSession } from '../../application/authoring/authoringSessionDefaults'
import {
  AUTHORING_SESSION_STORAGE_KEY,
  serializeAuthoringSession,
} from './localStorageAuthoringSessionRepository'
import {
  AUTHORING_PROJECTS_STORAGE_KEY,
  LocalStorageAuthoringProjectRepository,
} from './localStorageAuthoringProjectRepository'

function createSession(overrides: Partial<AuthoringSession> = {}): AuthoringSession {
  const generatedDraft = {
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters: [
      { sequence: 1, title: '沉入海底的鐘', prose: ['第一段', '第二段'] },
    ],
  }
  return {
    ...createEmptyAuthoringSession(),
    spec: {
      premise: '潮水每天提早一分鐘退去。',
      genre: '科幻懸疑',
      titleHint: '潮汐檔案',
      instructions: '保留線索。',
      requestedChapterCount: 3,
    },
    storyBible: {
      characters: [{ name: '林澄', notes: '追查潮汐裝置。' }],
      worldRules: ['潮汐裝置會記錄沒有被選中的未來。'],
      openThreads: ['下一次低潮前找到第一座鐘。'],
      styleNotes: ['維持克制的科幻懸疑氛圍。'],
    },
    draft: {
      ...generatedDraft,
      status: 'DRAFT',
      quality: {
        status: 'WARNING',
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
    ...overrides,
  }
}

describe('LocalStorageAuthoringProjectRepository', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('bootstraps a complete legacy session without deleting or rewriting legacy storage', () => {
    const session = createSession()
    const legacyRaw = serializeAuthoringSession(session)
    window.localStorage.setItem(AUTHORING_SESSION_STORAGE_KEY, legacyRaw)
    const repository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      () => 'project-legacy',
    )

    const loaded = repository.load()

    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.store.projects).toHaveLength(1)
    expect(loaded.store.activeProjectId).toBe('project-legacy')
    expect(loaded.store.projects[0]).toEqual(
      expect.objectContaining({ name: '潮汐檔案' }),
    )
    expect(loaded.store.projects[0]?.session).toMatchObject({
      spec: session.spec,
      storyBible: session.storyBible,
      publicationPreparation: session.publicationPreparation,
      targetPublishedBookId: session.targetPublishedBookId,
      basePublishedBookFingerprint: session.basePublishedBookFingerprint,
      draft: expect.objectContaining({
        title: session.draft?.title,
        chapters: session.draft?.chapters,
      }),
    })
    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBe(legacyRaw)
  })

  it('does not create a duplicate project on a second initialization', () => {
    const idGenerator = vi.fn(() => 'project-1')
    const repository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      idGenerator,
    )

    const first = repository.load()
    const second = repository.load()

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(second.store).toEqual(first.store)
      expect(second.store.projects).toHaveLength(1)
    }
    expect(idGenerator).toHaveBeenCalledTimes(1)
  })

  it('falls back to the first project when activeProjectId is invalid', () => {
    const sessionA = createSession({ targetPublishedBookId: 'book-a' })
    const sessionB = createSession({ targetPublishedBookId: undefined })
    window.localStorage.setItem(
      AUTHORING_PROJECTS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProjectId: 'missing-project',
        projects: [
          { projectId: 'project-a', name: 'A', session: JSON.parse(serializeAuthoringSession(sessionA)) },
          { projectId: 'project-b', name: 'B', session: JSON.parse(serializeAuthoringSession(sessionB)) },
        ],
      }),
    )

    const loaded = new LocalStorageAuthoringProjectRepository(window.localStorage).load()

    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.store.activeProjectId).toBe('project-a')
      expect(loaded.store.projects).toHaveLength(2)
    }
  })

  it.each([
    ['malformed JSON', '{broken'],
    ['duplicate project IDs', JSON.stringify({
      schemaVersion: 1,
      activeProjectId: 'project-a',
      projects: [
        { projectId: 'project-a', name: 'A', session: JSON.parse(serializeAuthoringSession(createSession())) },
        { projectId: 'project-a', name: 'B', session: JSON.parse(serializeAuthoringSession(createSession())) },
      ],
    })],
    ['malformed nested session', JSON.stringify({
      schemaVersion: 1,
      activeProjectId: 'project-a',
      projects: [{ projectId: 'project-a', name: 'A', session: { schemaVersion: 99 } }],
    })],
  ])('fails safely for %s and leaves stored data unchanged', (_label, raw) => {
    window.localStorage.setItem(AUTHORING_PROJECTS_STORAGE_KEY, raw)

    const loaded = new LocalStorageAuthoringProjectRepository(window.localStorage).load()

    expect(loaded).toEqual({
      ok: false,
      message: 'Authoring project library data is malformed and was not changed.',
    })
    expect(window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)).toBe(raw)
  })

  it('creates independent projects, normalizes names, and rejects empty names', () => {
    const ids = ['project-a', 'project-b']
    const repository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      () => ids.shift() ?? 'unexpected',
    )
    const initial = repository.load()
    expect(initial.ok).toBe(true)
    if (!initial.ok) return

    expect(repository.createProject(initial.store, '   ', createSession())).toEqual({
      ok: false,
      message: 'Project name cannot be empty.',
    })
    const created = repository.createProject(
      initial.store,
      '  新故事測試  ',
      createSession({ targetPublishedBookId: undefined }),
    )

    expect(created.ok).toBe(true)
    if (created.ok) {
      expect(created.store.activeProjectId).toBe('project-b')
      expect(created.store.projects.map((project) => project.name)).toEqual([
        'Untitled Project',
        '新故事測試',
      ])
      expect(created.store.projects[0]?.session.targetPublishedBookId).toBeUndefined()
      expect(created.store.projects[1]?.session.targetPublishedBookId).toBeUndefined()
    }
  })

  it('preserves legacy data when project-store bootstrap cannot write', () => {
    const session = createSession()
    const legacyRaw = serializeAuthoringSession(session)
    const storage = {
      ...window.localStorage,
      getItem: window.localStorage.getItem.bind(window.localStorage),
      setItem: vi.fn(() => {
        throw new Error('quota')
      }),
    } as unknown as Storage
    window.localStorage.setItem(AUTHORING_SESSION_STORAGE_KEY, legacyRaw)

    const loaded = new LocalStorageAuthoringProjectRepository(storage).load()

    expect(loaded.ok).toBe(false)
    expect(window.localStorage.getItem(AUTHORING_SESSION_STORAGE_KEY)).toBe(legacyRaw)
  })
})
