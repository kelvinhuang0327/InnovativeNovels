import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AuthoringGatewayClient } from '../../application/authoring/authoringGatewayClient'
import type {
  AuthoringProjectStoreV1,
} from '../../application/authoring/authoringProjectRepository'
import { createEmptyAuthoringSession } from '../../application/authoring/authoringSessionDefaults'
import type { PortableProjectFilePort } from '../../application/authoring/portableProjectFilePort'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { loadProductionCatalogContent } from '../../infrastructure/content/catalogContentLoader'
import { parseContentBookFixture } from '../../infrastructure/content/catalogContentContract'
import { LocalStorageAuthoringProjectRepository } from '../../infrastructure/persistence/localStorageAuthoringProjectRepository'
import { AuthoringPreviewScreen } from './AuthoringPreviewScreen'

function createSession(title: string, canon: string, targetPublishedBookId?: string) {
  const generatedDraft = {
    title,
    categoryLabel: '科幻懸疑',
    chapters: [
      { sequence: 1, title: `${title} 第一章`, prose: ['一', '二', '三', '四', '五'] },
    ],
  }
  return {
    ...createEmptyAuthoringSession(),
    storyBible: {
      characters: [{ name: canon, notes: `${canon} notes` }],
      worldRules: [],
      openThreads: [],
      styleNotes: [],
    },
    draft: {
      ...generatedDraft,
      status: 'DRAFT' as const,
      quality: evaluateDraftQuality(generatedDraft),
    },
    targetPublishedBookId,
    basePublishedBookFingerprint: targetPublishedBookId
      ? 'tide-base-fingerprint'
      : undefined,
  }
}

function createGatewayClient(): AuthoringGatewayClient {
  return {
    generateDraft: vi.fn(async () => ({
      ok: false as const,
      status: 'provider_error' as const,
      message: 'not used',
    })),
  }
}

function createRepository() {
  return new LocalStorageAuthoringProjectRepository(
    window.localStorage,
    () => 'unused-id',
  )
}

function seedStore(repository: LocalStorageAuthoringProjectRepository) {
  const store: AuthoringProjectStoreV1 = {
    schemaVersion: 1,
    activeProjectId: 'project-a',
    projects: [
      {
        projectId: 'project-a',
        name: '潮汐檔案續寫',
        session: createSession('A Draft', 'A canon', 'book-tide-archive'),
      },
      {
        projectId: 'project-b',
        name: '新故事測試',
        session: createSession('B Draft', 'B canon'),
      },
    ],
  }
  expect(repository.save(store)).toBe(true)
}

describe('Authoring project library UI', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('isolates A/B sessions, preserves target state, and restores the active project after reload', () => {
    const repository = createRepository()
    seedStore(repository)
    const view = render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        projectRepository={repository}
      />,
    )

    expect(screen.getByText('A Draft')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A canon')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Current Project'), {
      target: { value: 'project-b' },
    })
    expect(screen.getByText('B Draft')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B canon')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('A canon')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('草稿標題'), {
      target: { value: 'B Draft Edited' },
    })
    fireEvent.change(screen.getByLabelText('New Character name'), {
      target: { value: 'B only character' },
    })
    fireEvent.change(screen.getByLabelText('New Character notes'), {
      target: { value: 'B only notes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Character' }))

    fireEvent.change(screen.getByLabelText('Current Project'), {
      target: { value: 'project-a' },
    })
    expect(screen.getByText('A Draft')).toBeInTheDocument()
    expect(screen.getByDisplayValue('A canon')).toBeInTheDocument()
    expect(screen.queryByText('B Draft Edited')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('B only character')).not.toBeInTheDocument()

    const afterEdit = repository.load()
    expect(afterEdit.ok).toBe(true)
    if (afterEdit.ok) {
      const projectA = afterEdit.store.projects.find((project) => project.projectId === 'project-a')
      const projectB = afterEdit.store.projects.find((project) => project.projectId === 'project-b')
      expect(projectA?.session.targetPublishedBookId).toBe('book-tide-archive')
      expect(projectA?.session.basePublishedBookFingerprint).toBe('tide-base-fingerprint')
      expect(projectA?.session.draft?.title).toBe('A Draft')
      expect(projectB?.session.targetPublishedBookId).toBeUndefined()
      expect(projectB?.session.draft?.title).toBe('B Draft Edited')
      expect(projectB?.session.storyBible.characters).toContainEqual({
        name: 'B only character',
        notes: 'B only notes',
      })
    }

    fireEvent.change(screen.getByLabelText('Current Project'), {
      target: { value: 'project-b' },
    })
    view.unmount()
    render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        projectRepository={repository}
      />,
    )
    expect(screen.getByLabelText('Current Project')).toHaveValue('project-b')
    expect(screen.getByText('B Draft Edited')).toBeInTheDocument()
    expect(screen.getByDisplayValue('B only character')).toBeInTheDocument()
  })

  it('renames only the active project and creates a clean independent project', () => {
    const repository = createRepository()
    const seeded: AuthoringProjectStoreV1 = {
      schemaVersion: 1,
      activeProjectId: 'project-a',
      projects: [
        {
          projectId: 'project-a',
          name: 'Original',
          session: createSession('Existing Draft', 'Existing canon', 'book-tide-archive'),
        },
      ],
    }
    expect(repository.save(seeded)).toBe(true)
    const view = render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        projectRepository={repository}
      />,
    )

    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: '  Renamed Project  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rename Project' }))
    expect(screen.getByRole('option', { name: 'Renamed Project' })).toBeInTheDocument()
    expect(screen.getByText('Existing Draft')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('New project name'), {
      target: { value: 'New Blank Project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(screen.getByRole('option', { name: 'New Blank Project' })).toBeInTheDocument()
    expect(screen.queryByText('Existing Draft')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Current Project')).not.toHaveValue('project-a')

    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.store.projects).toHaveLength(2)
      expect(loaded.store.projects.find((project) => project.projectId === 'project-a')).toEqual(
        expect.objectContaining({ name: 'Renamed Project' }),
      )
      const blank = loaded.store.projects.find((project) => project.projectId !== 'project-a')
      expect(blank?.session.draft).toBeUndefined()
      expect(blank?.session.storyBible.characters).toHaveLength(0)
      expect(blank?.session.targetPublishedBookId).toBeUndefined()
    }

    view.unmount()
  })

  it('keeps Continue Published Book inside the active project', async () => {
    const repository = createRepository()
    const emptySession = createEmptyAuthoringSession()
    expect(
      repository.save({
        schemaVersion: 1,
        activeProjectId: 'project-a',
        projects: [
          { projectId: 'project-a', name: 'A', session: emptySession },
          { projectId: 'project-b', name: 'B', session: createEmptyAuthoringSession() },
        ],
      }),
    ).toBe(true)
    const production = loadProductionCatalogContent()
    const productionBefore = JSON.stringify(production)

    render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        productionBooks={production.books}
        productionChapterProse={(chapterId) => production.proseByChapterId.get(chapterId)}
        projectRepository={repository}
        validateProductionFixture={(fixture) =>
          parseContentBookFixture(`./books/${fixture.bookId}.json`, fixture)
        }
      />,
    )

    fireEvent.change(screen.getByLabelText('Published Book'), {
      target: { value: 'book-tide-archive' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue Published Book' }))
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(5)

    fireEvent.change(screen.getByLabelText('Current Project'), {
      target: { value: 'project-b' },
    })
    expect(screen.queryByRole('heading', { name: '潮汐檔案' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Base fingerprint captured/)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Current Project'), {
      target: { value: 'project-a' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Continuation Prompt' }))
    expect(
      (screen.getByRole('textbox', {
        name: 'Generated Continuation Prompt',
      }) as HTMLTextAreaElement).value,
    ).toContain('starting at sequence 6')

    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      const projectA = loaded.store.projects.find((project) => project.projectId === 'project-a')
      const projectB = loaded.store.projects.find((project) => project.projectId === 'project-b')
      expect(projectA?.session.targetPublishedBookId).toBe('book-tide-archive')
      expect(projectA?.session.draft?.chapters).toHaveLength(5)
      expect(projectB?.session.targetPublishedBookId).toBeUndefined()
      expect(projectB?.session.draft).toBeUndefined()
    }
    expect(JSON.stringify(production)).toBe(productionBefore)
  })

  it('exports the active project and imports it as a new active project', async () => {
    const ids = ['project-imported']
    const repository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      () => ids.shift() ?? 'unexpected-id',
    )
    seedStore(repository)
    const read = vi.fn(async () => ({
      ok: true as const,
      text: String(portableDownload.mock.calls[0]?.[1] ?? ''),
    }))
    const portableDownload = vi.fn()
    const portableProjectFilePort: PortableProjectFilePort = {
      download: portableDownload,
      read,
    }

    render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        portableProjectFilePort={portableProjectFilePort}
        projectRepository={repository}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Export Current Project' }))
    expect(portableDownload).toHaveBeenCalledTimes(1)
    expect(portableDownload.mock.calls[0]?.[0]).toBe(
      'innovative-novels-project-潮汐檔案續寫.json',
    )
    const exported = JSON.parse(String(portableDownload.mock.calls[0]?.[1])) as {
      format: string
      version: number
      project: { projectId: string; name: string }
    }
    expect(exported.format).toBe('innovative-novels-authoring-project')
    expect(exported.version).toBe(1)
    expect(exported.project).toMatchObject({
      projectId: 'project-a',
      name: '潮汐檔案續寫',
    })

    fireEvent.change(screen.getByLabelText('Import Project file'), {
      target: { files: [new File(['portable'], 'project.json', { type: 'text/plain' })] },
    })
    expect(await screen.findByLabelText('Current Project')).toHaveValue('project-imported')

    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      expect(loaded.store.projects).toHaveLength(3)
      expect(loaded.store.projects[0]).toEqual(
        expect.objectContaining({ projectId: 'project-a', name: '潮汐檔案續寫' }),
      )
      expect(loaded.store.projects[1]).toEqual(
        expect.objectContaining({ projectId: 'project-b', name: '新故事測試' }),
      )
      expect(loaded.store.projects[2]).toEqual(
        expect.objectContaining({ projectId: 'project-imported', name: '潮汐檔案續寫' }),
      )
    }
  })

  it('shows invalid portable-file errors without mutating the project store', async () => {
    const repository = createRepository()
    seedStore(repository)
    const before = window.localStorage.getItem('innovative-novels:authoring-projects:v1')
    const portableProjectFilePort: PortableProjectFilePort = {
      download: vi.fn(),
      read: vi.fn(async () => ({
        ok: true as const,
        text: '```json\n{}\n```',
      })),
    }

    render(
      <AuthoringPreviewScreen
        gatewayClient={createGatewayClient()}
        onBack={vi.fn()}
        portableProjectFilePort={portableProjectFilePort}
        projectRepository={repository}
      />,
    )

    fireEvent.change(screen.getByLabelText('Import Project file'), {
      target: { files: [new File(['portable'], 'project.json')] },
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The selected file is not valid JSON.',
    )
    expect(window.localStorage.getItem('innovative-novels:authoring-projects:v1')).toBe(before)
    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (loaded.ok) expect(loaded.store.projects).toHaveLength(2)
  })
})
