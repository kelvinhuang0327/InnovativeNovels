import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyAuthoringSession } from '../../application/authoring/authoringSessionDefaults'
import type { AuthoringProjectStoreV1 } from '../../application/authoring/authoringProjectRepository'
import { exportDraftJson } from '../../application/authoring/draftExport'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { LocalStorageAuthoringProjectRepository } from '../../infrastructure/persistence/localStorageAuthoringProjectRepository'
import { ResilientBrowserStorage } from '../../infrastructure/persistence/resilientBrowserStorage'
import { AuthoringPreviewScreen } from './AuthoringPreviewScreen'

const storageKey = 'innovative-novels:authoring-projects:v1'

function session(title: string) {
  const generated = {
    title, categoryLabel: '合成測試',
    chapters: [{ sequence: 1, title: '合成第一章', prose: ['一', '二', '三', '四', '五'],
      metadata: { summary: '合成觀察', keyEvents: ['合成事件'] } }],
  }
  return { ...createEmptyAuthoringSession(),
    storyBible: { characters: [{ name: title, notes: '既有設定' }], worldRules: [], openThreads: [], styleNotes: [] },
    draft: { ...generated, status: 'DRAFT' as const, quality: evaluateDraftQuality(generated) } }
}

function setup(idGenerator: () => string = () => 'restored-c', storage: Storage = window.localStorage) {
  const repository = new LocalStorageAuthoringProjectRepository(storage, idGenerator)
  const store: AuthoringProjectStoreV1 = { schemaVersion: 1, activeProjectId: 'project-a', projects: [
    { projectId: 'project-a', name: '合成作品 A', session: session('合成草稿 A') },
    { projectId: 'project-b', name: '合成作品 B', session: session('合成草稿 B') },
  ] }
  expect(repository.save(store)).toBe(true)
  let exported = ''
  const exporter = { exportFile: vi.fn(async (file: { content: string; filename: string }) => {
    exported = file.content
    return { status: 'downloaded' as const, filename: file.filename }
  }) }
  const read = vi.fn(async () => ({ ok: true as const, text: exported }))
  const props = {
    gatewayClient: { generateDraft: vi.fn(async () => ({ ok: false as const, status: 'provider_error' as const, message: 'unused' })) },
    onBack: vi.fn(), projectRepository: repository, textFileExportPort: exporter,
    portableProjectFilePort: { download: vi.fn(), read },
  }
  const view = render(<AuthoringPreviewScreen {...props} />)
  return { repository, read, exporter, props, view, store }
}

async function exportBAndSelectA() {
  fireEvent.change(screen.getByLabelText('Current Project'), { target: { value: 'project-b' } })
  fireEvent.click(screen.getByRole('button', { name: '匯出草稿 JSON' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '匯出草稿 JSON' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Current Project'), { target: { value: 'project-a' } })
  const before = window.localStorage.getItem(storageKey)
  fireEvent.change(screen.getByLabelText('Import Project file'), { target: { files: [new File(['synthetic'], 'draft.json')] } })
  return before
}

describe('Draft JSON file restore', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); window.localStorage.clear() })

  it('previews an exported draft without writing, then restores it as one new project and survives remount', async () => {
    const ids = vi.fn().mockReturnValueOnce('project-a').mockReturnValueOnce('project-b').mockReturnValue('restored-c')
    const { repository, view, props } = setup(ids)
    const before = await exportBAndSelectA()
    const preview = await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    expect(screen.getByLabelText('草稿標題')).toHaveValue('合成草稿 A')
    expect(within(preview).getByText('合成草稿 B')).toBeInTheDocument()
    const save = vi.spyOn(repository, 'createProject')
    const confirm = within(preview).getByRole('button', { name: '確認另存新專案' })
    act(() => { confirm.click(); confirm.click() })
    expect(save).toHaveBeenCalledTimes(1)
    expect(ids).toHaveBeenCalledTimes(3)
    expect(screen.getByLabelText('Current Project')).toHaveValue('restored-c')
    const loaded = repository.load()
    const original = JSON.parse(before ?? '{}')
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('Synthetic restore failed')
    expect(loaded.store.projects).toHaveLength(3)
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}').projects.slice(0, 2)).toEqual(original.projects)
    expect(loaded.store.projects.slice(0, 2).map(({ projectId }) => projectId)).toEqual(['project-a', 'project-b'])
    expect(loaded.store.projects[0].session.draft?.title).toBe(original.projects[0].session.draft.title)
    expect(loaded.store.projects[0].session.storyBible).toEqual(original.projects[0].session.storyBible)
    expect(exportDraftJson(loaded.store.projects[2].session.draft!)).toBe(exportDraftJson(session('合成草稿 B').draft))
    expect(loaded.store.projects[2].session.targetPublishedBookId).toBeUndefined()
    view.unmount()
    render(<AuthoringPreviewScreen {...props} />)
    expect(screen.getByLabelText('Current Project')).toHaveValue('restored-c')
    expect(screen.getByLabelText('草稿標題')).toHaveValue('合成草稿 B')
  })

  it('cancels a preview and an empty file selection without writing or clearing existing work', async () => {
    const { repository } = setup()
    const before = await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    const save = vi.spyOn(repository, 'save')
    fireEvent.click(screen.getByRole('button', { name: '取消匯入' }))
    fireEvent.change(screen.getByLabelText('Import Project file'), { target: { files: [] } })
    expect(screen.queryByRole('region', { name: '草稿 JSON 還原預覽' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('草稿標題')).toHaveValue('合成草稿 A')
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    expect(save).not.toHaveBeenCalled()
  })

  it('rejects a new invalid selection and removes the older confirmable preview', async () => {
    const { read } = setup()
    const before = await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    read.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ title: '錯誤輸入', genre: '合成', chapters: [], bookId: 'not-allowed' }) })
    fireEvent.change(screen.getByLabelText('Import Project file'), { target: { files: [new File(['bad'], 'bad.json')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('不支援欄位')
    expect(screen.queryByRole('button', { name: '確認另存新專案' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(storageKey)).toBe(before)
  })

  it('keeps existing work on quota failure and allows an explicit retry of the same preview', async () => {
    setup()
    const before = await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('synthetic quota', 'QuotaExceededError') })
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    expect(screen.getByRole('alert')).toHaveTextContent('原有作品保留')
    expect(screen.getByLabelText('Current Project')).toHaveValue('project-a')
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    storage.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    expect(screen.getByLabelText('Current Project')).toHaveValue('restored-c')
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}').projects).toHaveLength(3)
  })

  it('reports exhausted identity collisions without replacing any project', async () => {
    setup(() => 'project-a')
    const before = await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    expect(screen.getByRole('alert')).toHaveTextContent('unique local project identity')
    expect(window.localStorage.getItem(storageKey)).toBe(before)
  })

  it('does not count resilient session fallback as a saved backup and retries persistence explicitly', async () => {
    const resilient = new ResilientBrowserStorage(() => window.localStorage)
    const { repository } = setup(undefined, resilient)
    const before = await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('synthetic quota', 'QuotaExceededError') })
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    expect(screen.getByRole('alert')).toHaveTextContent('原有作品保留')
    expect(screen.getByLabelText('Current Project')).toHaveValue('project-a')
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    expect(resilient.getItem(storageKey)).toBe(before)
    expect(resilient.getSnapshot()).toBe(false)
    storage.mockRestore()
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    expect(screen.getByLabelText('Current Project')).toHaveValue('restored-c')
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? '{}').projects).toHaveLength(3)
    const loaded = repository.load()
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) throw new Error('Synthetic durable restore failed')
    expect(loaded.store.activeProjectId).toBe('restored-c')
  })

  it('reads the latest project store at confirmation so a newer project is preserved', async () => {
    const ids = vi.fn().mockReturnValueOnce('later-project').mockReturnValue('restored-c')
    const { repository } = setup(ids)
    await exportBAndSelectA()
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    const loaded = repository.load()
    if (!loaded.ok) throw new Error('Synthetic store unavailable')
    expect(repository.createProject(loaded.store, '較晚的作品', session('較晚的草稿')).ok).toBe(true)
    const beforeConfirmation = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    fireEvent.click(screen.getByRole('button', { name: '確認另存新專案' }))
    const after = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}')
    expect(after.projects.slice(0, 3)).toEqual(beforeConfirmation.projects)
    expect(after.projects).toHaveLength(4)
    expect(screen.getByLabelText('Current Project')).toHaveValue('restored-c')
  })

  it('guards overlapping reads and ignores a late file result after switching projects', async () => {
    const { read, repository } = setup()
    let complete: (result: { ok: true; text: string }) => void = () => {}
    read.mockImplementation(() => new Promise((resolve) => { complete = resolve }))
    const input = screen.getByLabelText('Import Project file')
    act(() => {
      fireEvent.change(input, { target: { files: [new File(['one'], 'one.json')] } })
      fireEvent.change(input, { target: { files: [new File(['two'], 'two.json')] } })
    })
    expect(read).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Current Project'), { target: { value: 'project-b' } })
    const before = window.localStorage.getItem(storageKey)
    const save = vi.spyOn(repository, 'save')
    await act(async () => { complete({ ok: true, text: exportDraftJson(session('遲到備份').draft) }) })
    expect(screen.queryByRole('region', { name: '草稿 JSON 還原預覽' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('草稿標題')).toHaveValue('合成草稿 B')
    expect(window.localStorage.getItem(storageKey)).toBe(before)
    expect(save).not.toHaveBeenCalled()
    expect(input).toBeEnabled()
  })

  it('captures selected files before clearing a live file list', async () => {
    const { read } = setup()
    read.mockResolvedValueOnce({ ok: true, text: exportDraftJson(session('合成備份').draft) })
    const input = screen.getByLabelText('Import Project file') as HTMLInputElement
    const selected = new File(['synthetic'], 'draft.json')
    const liveFiles = [selected]
    Object.defineProperty(input, 'files', { configurable: true, get: () => liveFiles })
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: () => { liveFiles.length = 0 } })
    fireEvent.change(input)
    await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    expect(liveFiles).toHaveLength(0)
    expect(read).toHaveBeenCalledWith(selected)
  })

  it('rejects oversized files before reading and renders markup-looking draft text as text', async () => {
    const { read } = setup()
    const before = window.localStorage.getItem(storageKey)
    const huge = new File(['synthetic'], 'large.json')
    Object.defineProperty(huge, 'size', { value: 15 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText('Import Project file'), { target: { files: [huge] } })
    expect(screen.getByRole('alert')).toHaveTextContent('15 MB')
    expect(read).not.toHaveBeenCalled()
    read.mockResolvedValueOnce({ ok: true, text: exportDraftJson(session('<script>synthetic()</script>').draft) })
    fireEvent.change(screen.getByLabelText('Import Project file'), { target: { files: [new File(['safe JSON'], 'literal.json')] } })
    const preview = await screen.findByRole('region', { name: '草稿 JSON 還原預覽' })
    expect(within(preview).getByText('<script>synthetic()</script>')).toBeInTheDocument()
    expect(preview.querySelector('script')).toBeNull()
    expect(window.localStorage.getItem(storageKey)).toBe(before)
  })
})
