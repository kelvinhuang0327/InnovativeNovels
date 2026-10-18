import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('exports editable Draft JSON, preserving the project through cancellation, failure and retry', async () => {
    const repository = createRepository()
    seedStore(repository)
    const exporter = { exportFile: vi.fn()
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockRejectedValueOnce(new Error('disk failure'))
      .mockResolvedValueOnce({ status: 'saved', filename: 'innovative-novels-draft-A Draft.json' }) }
    const view = render(<AuthoringPreviewScreen gatewayClient={createGatewayClient()} onBack={vi.fn()} projectRepository={repository} textFileExportPort={exporter} />)
    const original = repository.load()
    const button = screen.getByRole('button', { name: '匯出草稿 JSON' })
    const group = screen.getByRole('group', { name: '草稿檔案匯出' })
    fireEvent.click(button)
    const cancelled = await within(group).findByRole('status')
    expect(cancelled).toHaveTextContent('已取消匯出，原有資料保留。')
    expect(button).toHaveAccessibleDescription(cancelled.textContent ?? '')
    expect(screen.getAllByText('已取消匯出，原有資料保留。')).toHaveLength(1)
    fireEvent.click(button)
    const failed = await within(group).findByRole('alert')
    expect(failed).toHaveTextContent('無法匯出檔案')
    expect(within(group).queryByRole('status')).not.toBeInTheDocument()
    expect(button).toHaveAccessibleDescription(failed.textContent ?? '')
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeEnabled())
    const saved = within(group).getByRole('status')
    expect(saved).toHaveTextContent('已儲存 innovative-novels-draft-A Draft.json')
    expect(within(group).queryByRole('alert')).not.toBeInTheDocument()
    expect(button).toHaveAccessibleDescription(saved.textContent ?? '')
    expect(exporter.exportFile).toHaveBeenCalledTimes(3)
    const file = exporter.exportFile.mock.calls[2]?.[0]
    expect(file).toMatchObject({ filename: 'innovative-novels-draft-A Draft.json', mimeType: 'application/json' })
    expect(JSON.parse(file.content)).toMatchObject({ title: 'A Draft', chapters: [{ sequence: 1, prose: '一\n\n二\n\n三\n\n四\n\n五' }] })
    expect(repository.load()).toEqual(original)
    view.unmount()
    render(<AuthoringPreviewScreen gatewayClient={createGatewayClient()} onBack={vi.fn()} projectRepository={repository} />)
    expect(screen.getByLabelText('草稿標題')).toHaveValue('A Draft')
  })

  it('guards a pending project export and reports failure without replacing the active project', async () => {
    const repository = createRepository()
    seedStore(repository)
    let fail: (reason: Error) => void = () => {}
    const download = vi.fn(() => new Promise<never>((_, reject) => { fail = reject }))
    const port: PortableProjectFilePort = { download, read: vi.fn() }
    render(<AuthoringPreviewScreen gatewayClient={createGatewayClient()} onBack={vi.fn()} projectRepository={repository} portableProjectFilePort={port} />)
    const original = repository.load()
    const button = screen.getByRole('button', { name: 'Export Current Project' })
    const group = screen.getByRole('group', { name: '專案檔案匯出' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(download).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '匯出草稿 JSON' })).toBeDisabled()
    fail(new Error('write failed'))
    const failed = await within(group).findByRole('alert')
    expect(failed).toHaveTextContent('無法匯出檔案')
    expect(button).toHaveAccessibleDescription(failed.textContent ?? '')
    expect(within(screen.getByRole('group', { name: '草稿檔案匯出' })).queryByRole('alert')).not.toBeInTheDocument()
    expect(button).toBeEnabled()
    expect(repository.load()).toEqual(original)
  })

  it('keeps one result beside the triggering export button when changing between project and draft exports', async () => {
    const repository = createRepository()
    seedStore(repository)
    const projectFilename = 'innovative-novels-project-潮汐檔案續寫.json'
    const download = vi.fn<PortableProjectFilePort['download']>()
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'saved', filename: projectFilename })
    const textFileExportPort = {
      exportFile: vi.fn(async () => ({ status: 'saved' as const, filename: 'draft.json' })),
    }
    render(<AuthoringPreviewScreen gatewayClient={createGatewayClient()} onBack={vi.fn()} projectRepository={repository} portableProjectFilePort={{ download, read: vi.fn() }} textFileExportPort={textFileExportPort} />)
    const original = repository.load()
    const projectGroup = screen.getByRole('group', { name: '專案檔案匯出' })
    const draftGroup = screen.getByRole('group', { name: '草稿檔案匯出' })
    const projectButton = within(projectGroup).getByRole('button', { name: 'Export Current Project' })

    fireEvent.click(projectButton)
    expect(await within(projectGroup).findByRole('status')).toHaveTextContent('已取消匯出')
    expect(within(draftGroup).queryByRole('status')).not.toBeInTheDocument()
    expect(repository.load()).toEqual(original)

    fireEvent.click(projectButton)
    const projectSaved = await within(projectGroup).findByRole('status')
    expect(projectSaved).toHaveTextContent(`已儲存 ${projectFilename}`)
    expect(projectButton).toHaveAccessibleDescription(projectSaved.textContent ?? '')
    expect(repository.load()).toEqual(original)

    fireEvent.click(within(draftGroup).getByRole('button', { name: '匯出草稿 JSON' }))
    expect(await within(draftGroup).findByRole('status')).toHaveTextContent('已儲存 draft.json')
    expect(within(projectGroup).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByText(`已儲存 ${projectFilename}。可在「檔案」App 的匯出資料夾查看。`)).not.toBeInTheDocument()
    expect(repository.load()).toEqual(original)
  })

  it('does not show a late export result beside a different active project', async () => {
    const repository = createRepository()
    seedStore(repository)
    let complete: (result: { status: 'saved'; filename: string }) => void = () => {}
    const download = vi.fn(() => new Promise<{ status: 'saved'; filename: string }>((resolve) => { complete = resolve }))
    render(<AuthoringPreviewScreen gatewayClient={createGatewayClient()} onBack={vi.fn()} projectRepository={repository} portableProjectFilePort={{ download, read: vi.fn() }} />)
    const original = repository.load()
    const button = screen.getByRole('button', { name: 'Export Current Project' })
    fireEvent.click(button)
    fireEvent.change(screen.getByLabelText('Current Project'), { target: { value: 'project-b' } })
    complete({ status: 'saved', filename: 'project-a.json' })
    await waitFor(() => expect(button).toBeEnabled())
    expect(within(screen.getByRole('group', { name: '專案檔案匯出' })).queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByLabelText('草稿標題')).toHaveValue('B Draft')
    const after = repository.load()
    expect(after.ok).toBe(true)
    expect(original.ok).toBe(true)
    if (after.ok && original.ok) expect(after.store.projects).toEqual(original.store.projects)
  })
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
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(10)

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
    ).toContain('starting at sequence 11')

    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (loaded.ok) {
      const projectA = loaded.store.projects.find((project) => project.projectId === 'project-a')
      const projectB = loaded.store.projects.find((project) => project.projectId === 'project-b')
      expect(projectA?.session.targetPublishedBookId).toBe('book-tide-archive')
      expect(projectA?.session.draft?.chapters).toHaveLength(10)
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export Current Project' })).toBeEnabled())

    fireEvent.change(screen.getByLabelText('Import Project file'), {
      target: { files: [new File(['portable'], 'project.json', { type: 'text/plain' })] },
    })
    await waitFor(() => expect(screen.getByLabelText('Current Project')).toHaveValue('project-imported'))

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
