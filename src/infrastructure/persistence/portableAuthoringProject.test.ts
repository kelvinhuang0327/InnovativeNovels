import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthoringProjectStoreV1 } from '../../application/authoring/authoringProjectRepository'
import type { AuthoringSession } from '../../application/authoring/authoringSessionRepository'
import { createEmptyAuthoringSession } from '../../application/authoring/authoringSessionDefaults'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { loadProductionCatalogContent } from '../content/catalogContentLoader'
import {
  parsePortableAuthoringProject,
  PORTABLE_AUTHORING_PROJECT_FORMAT,
  serializePortableAuthoringProject,
} from './portableAuthoringProject'
import {
  AUTHORING_PROJECTS_STORAGE_KEY,
  LocalStorageAuthoringProjectRepository,
} from './localStorageAuthoringProjectRepository'

function createSession(projectId: string): AuthoringSession {
  const generatedDraft = {
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters: [
      {
        sequence: 1,
        title: '沉入海底的鐘',
        prose: ['海水覆過鐘面。', '潮聲在門後停住。'],
      },
      {
        sequence: 2,
        title: '沒有被選中的未來',
        prose: ['她看見第二座鐘。'],
      },
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
    agentPrompt: 'Role: Novel Generation Agent',
    continuationPrompt: 'Role: Novel Continuation Agent',
    draft: {
      ...generatedDraft,
      status: 'DRAFT',
      quality: evaluateDraftQuality(generatedDraft),
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
      schemaVersion: 1,
      readiness: 'READY',
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
          access: 'READABLE',
          prose: ['第一段', '第二段'],
        },
      ],
      updatedFixturePreview: {
        schema: 'innovative-novels/content-book/v1',
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
            access: 'READABLE',
            prose: ['第一段', '第二段'],
          },
        ],
      },
      quality: { status: 'PASS', hardFailures: [], warnings: [] },
      warnings: [],
      validation: {
        status: 'PASS',
        validator: 'production-content-fixture-v1',
      },
    },
    lastContinuityReviewedSequence: 2,
    continuityReviewBatch: {
      schemaVersion: 1,
      projectId,
      reviewedFromSequence: 1,
      reviewedToSequence: 1,
      sourceDraftFingerprint: 'draft-range-fingerprint',
      sourceBibleFingerprint: 'bible-fingerprint',
      generatedPrompt: 'Role: Novel Story Bible Continuity Review Agent',
      proposals: [],
      status: 'DRAFT',
    },
  }
}

function createStore(): AuthoringProjectStoreV1 {
  return {
    schemaVersion: 1,
    activeProjectId: 'project-a',
    projects: [
      {
        projectId: 'project-a',
        name: '潮汐檔案續寫',
        session: createSession('project-a'),
      },
      {
        projectId: 'project-b',
        name: '另一個故事',
        session: createSession('project-b'),
      },
    ],
  }
}

function createRepository(ids: readonly string[]) {
  const queue = [...ids]
  return new LocalStorageAuthoringProjectRepository(
    window.localStorage,
    () => queue.shift() ?? 'fallback-project',
  )
}

function documentFrom(raw: string): Record<string, unknown> {
  return JSON.parse(raw) as Record<string, unknown>
}

describe('PortableAuthoringProjectV1', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('serializes deterministic complete authoring semantics without store-global or Reader state', () => {
    const project = createStore().projects[0]
    const raw = serializePortableAuthoringProject(project)
    const secondRaw = serializePortableAuthoringProject(project)
    const document = documentFrom(raw)

    expect(raw).toBe(secondRaw)
    expect(document).toMatchObject({
      format: PORTABLE_AUTHORING_PROJECT_FORMAT,
      version: 1,
      project: {
        projectId: 'project-a',
        name: '潮汐檔案續寫',
      },
    })
    expect(document).not.toHaveProperty('activeProjectId')
    expect(document).not.toHaveProperty('projects')
    expect(document).not.toHaveProperty('reader')
    expect(document).not.toHaveProperty('production')
    expect(document.project).toHaveProperty('session.targetPublishedBookId', 'book-tide-archive')
    expect(document.project).toHaveProperty(
      'session.basePublishedBookFingerprint',
      'base-fingerprint-v1',
    )
    expect(document.project).toHaveProperty('session.storyBible.characters')
    expect(document.project).toHaveProperty('session.continuityReviewBatch')
    expect(document.project).toHaveProperty('session.publishedAppendCandidate')
  })

  it('strictly rejects malformed, fenced, unrelated, unsupported, and duplicate-field documents', () => {
    const raw = serializePortableAuthoringProject(createStore().projects[0])
    const original = documentFrom(raw)
    const invalidDocuments: readonly [string, string][] = [
      ['malformed JSON', '{broken'],
      ['Markdown fenced JSON', `\`\`\`json\n${raw}\n\`\`\``],
      ['Agent Draft JSON', JSON.stringify({ title: 'Draft', genre: '科幻', chapters: [] })],
      [
        'wrong format',
        JSON.stringify({ ...original, format: 'innovative-novels-agent-draft' }),
      ],
      ['version 0', JSON.stringify({ ...original, version: 0 })],
      ['future version', JSON.stringify({ ...original, version: 2 })],
      ['missing project', JSON.stringify({ format: original.format, version: 1 })],
      [
        'malformed project name',
        JSON.stringify({ ...original, project: { ...(original.project as object), name: '' } }),
      ],
      [
        'malformed session',
        JSON.stringify({ ...original, project: { ...(original.project as object), session: { schemaVersion: 99 } } }),
      ],
      [
        'unknown top-level field',
        JSON.stringify({ ...original, unexpected: true }),
      ],
      [
        'duplicate project identity field',
        raw.replace(
          '      "projectId": "project-a",',
          '      "projectId": "project-a",\n      "projectId": "other",',
        ),
      ],
    ]

    for (const [label, invalid] of invalidDocuments) {
      const parsed = parsePortableAuthoringProject(invalid)
      expect(parsed.ok, label).toBe(false)
    }
  })

  it('imports a same-name project as a third isolated project with a fresh ID and remapped local review ownership', () => {
    const store = createStore()
    const productionBefore = JSON.stringify(loadProductionCatalogContent())
    window.localStorage.setItem('reader-state', 'must-remain-unchanged')
    const repository = createRepository(['project-a', 'project-imported'])
    expect(repository.save(store)).toBe(true)
    const sourceProject = store.projects[0]
    const raw = repository.exportPortableProject(sourceProject)
    const before = repository.load()
    expect(before.ok).toBe(true)
    if (!before.ok) return

    const imported = repository.importPortableProject(before.store, raw)

    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    expect(imported.importedProjectId).toBe('project-imported')
    expect(imported.store.projects).toHaveLength(3)
    expect(imported.store.activeProjectId).toBe('project-imported')
    expect(imported.store.projects[2]).toEqual(
      expect.objectContaining({ projectId: 'project-imported', name: '潮汐檔案續寫' }),
    )
    expect(imported.store.projects[2]?.session).toMatchObject({
      spec: sourceProject.session.spec,
      storyBible: sourceProject.session.storyBible,
      draft: expect.objectContaining({
        title: sourceProject.session.draft?.title,
        chapters: sourceProject.session.draft?.chapters,
      }),
      targetPublishedBookId: 'book-tide-archive',
      basePublishedBookFingerprint: 'base-fingerprint-v1',
      publishedAppendCandidate: sourceProject.session.publishedAppendCandidate,
      lastContinuityReviewedSequence: 2,
      continuityReviewBatch: expect.objectContaining({ projectId: 'project-imported' }),
    })
    expect(imported.store.projects[0]).toEqual(before.store.projects[0])
    expect(imported.store.projects[1]).toEqual(before.store.projects[1])
    expect(window.localStorage.getItem('reader-state')).toBe('must-remain-unchanged')
    expect(JSON.stringify(loadProductionCatalogContent())).toBe(productionBefore)

    const roundTrip = parsePortableAuthoringProject(
      repository.exportPortableProject(imported.store.projects[2]),
    )
    expect(roundTrip.ok).toBe(true)
    if (roundTrip.ok) {
      expect(roundTrip.project.project.session).toEqual(
        imported.store.projects[2]?.session,
      )
    }

    const reloaded = repository.load()
    expect(reloaded).toMatchObject({ ok: true, store: imported.store })
  })

  it('skips incoming and existing ID collisions without overwriting either project', () => {
    const store = createStore()
    const repository = createRepository(['project-a', 'fresh-id'])
    expect(repository.save(store)).toBe(true)
    const source = {
      ...store.projects[1],
      session: createSession('project-b'),
    }
    const raw = repository.exportPortableProject(source)
    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const imported = repository.importPortableProject(loaded.store, raw)

    expect(imported.ok).toBe(true)
    if (imported.ok) {
      expect(imported.importedProjectId).toBe('fresh-id')
      expect(imported.store.projects.map((project) => project.projectId)).toEqual([
        'project-a',
        'project-b',
        'fresh-id',
      ])
      expect(imported.store.projects[0]).toEqual(loaded.store.projects[0])
      expect(imported.store.projects[1]).toEqual(loaded.store.projects[1])
    }
  })

  it('performs zero project-store mutation for invalid imports and persistence failure', () => {
    const store = createStore()
    const repository = createRepository(['fresh-id'])
    expect(repository.save(store)).toBe(true)
    const before = window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)
    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const invalid = repository.importPortableProject(loaded.store, '{broken')
    expect(invalid).toMatchObject({ ok: false, code: 'INVALID_JSON' })
    expect(window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)).toBe(before)

    const failingStorage = {
      getItem: window.localStorage.getItem.bind(window.localStorage),
      setItem: vi.fn(() => {
        throw new Error('quota')
      }),
      removeItem: window.localStorage.removeItem.bind(window.localStorage),
      clear: window.localStorage.clear.bind(window.localStorage),
      key: window.localStorage.key.bind(window.localStorage),
      get length() {
        return window.localStorage.length
      },
    } as unknown as Storage
    const repositoryWithFailure = new LocalStorageAuthoringProjectRepository(
      failingStorage,
      () => 'fresh-id-2',
    )
    const failed = repositoryWithFailure.importPortableProject(
      loaded.store,
      repository.exportPortableProject(store.projects[0]),
    )
    expect(failed).toMatchObject({ ok: false, code: 'PERSISTENCE_FAILED' })
    expect(window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)).toBe(before)
  })

  it('rejects a review batch that claims a different source project without mutating storage', () => {
    const store = createStore()
    const repository = createRepository(['fresh-id'])
    expect(repository.save(store)).toBe(true)
    const raw = repository.exportPortableProject(store.projects[0])
    const document = documentFrom(raw)
    const project = document.project as Record<string, unknown>
    const session = project.session as Record<string, unknown>
    const batch = session.continuityReviewBatch as Record<string, unknown>
    batch.projectId = 'different-project'
    const before = window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)
    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return

    const result = repository.importPortableProject(loaded.store, JSON.stringify(document))

    expect(result).toMatchObject({ ok: false, code: 'PROJECT_LOCAL_IDENTITY_INVALID' })
    expect(window.localStorage.getItem(AUTHORING_PROJECTS_STORAGE_KEY)).toBe(before)
  })
})
