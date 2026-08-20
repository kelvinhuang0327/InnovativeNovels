import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import { importAgentDraft } from '../../application/authoring/agentDraftImport'
import type { AuthoringSessionRepository } from '../../application/authoring/authoringSessionRepository'
import type { ClipboardPort } from '../../application/authoring/clipboardPort'
import type { GeneratedDraft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { createEmptyStoryBible } from '../../domain/authoring/storyBible'
import tideArchiveFixture from '../../infrastructure/content/books/book-tide-archive.json'
import { parseContentBookFixture } from '../../infrastructure/content/catalogContentContract'
import { loadProductionCatalogContent } from '../../infrastructure/content/catalogContentLoader'
import { fingerprintPublishedBook } from '../../domain/authoring/publishedAppendCandidate'
import { createPublishedBookSnapshot } from '../../domain/authoring/publishedAppendCandidate'
import { AuthoringPreviewScreen } from './AuthoringPreviewScreen'
import { LocalStorageAuthoringProjectRepository } from '../../infrastructure/persistence/localStorageAuthoringProjectRepository'

const generatedDraft: GeneratedDraft = {
  title: '預覽草稿',
  categoryLabel: '懸疑',
  chapters: [
    {
      sequence: 1,
      title: '第一章',
      prose: ['第一段。', '第二段。'],
    },
    {
      sequence: 2,
      title: '第二章',
      prose: ['第三段。', '第四段。'],
    },
  ],
}

function successResult(): Extract<
  AuthoringGatewayClientResult,
  { readonly ok: true }
> {
  const quality = evaluateDraftQuality(generatedDraft)
  return {
    ok: true,
    draft: { ...generatedDraft, status: 'DRAFT', quality },
    quality,
    providerName: 'deterministic-local-demo',
  }
}

function createClient(
  result: AuthoringGatewayClientResult = successResult(),
): AuthoringGatewayClient {
  return {
    generateDraft: vi.fn(async () => result),
  }
}

const agentDraftJson = JSON.stringify({
  title: '潮汐檔案',
  genre: '科幻懸疑',
  chapters: [
    {
      sequence: 1,
      title: '沉入海底的鐘',
      prose: '第一段海水覆過鐘面。\n\n第二段城市失去第一個音節。',
    },
    {
      sequence: 2,
      title: '舊港的回聲',
      prose: '第一段舊港起霧。\n\n第二段回聲折回昨天。',
    },
    {
      sequence: 3,
      title: '第四點整',
      prose: '第一段潮汐停住。\n\n第二段空白浮出水面。',
    },
  ],
})

const continuationJson = JSON.stringify({
  chapters: [
    {
      sequence: 4,
      title: '鐘下的新頁',
      prose: '第四章第一段。\n\n第四章第二段。',
    },
    {
      sequence: 5,
      title: '潮水回來以前',
      prose: '第五章第一段。\n\n第五章第二段。',
    },
  ],
})

const liveProduction = loadProductionCatalogContent()
const extendedPublishedDraftJson = JSON.stringify({
  title: tideArchiveFixture.title,
  genre: tideArchiveFixture.categoryLabel,
  chapters: [
    ...tideArchiveFixture.chapters.slice(0, 3).map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: chapter.prose?.join('\n\n') ?? '',
    })),
    {
      sequence: 4,
      title: '鐘下的新頁',
      prose: '第四章第一段。\n\n第四章第二段。\n\n第四章第三段。\n\n第四章第四段。\n\n第四章第五段。',
    },
    {
      sequence: 5,
      title: '潮水回來以前',
      prose: '第五章第一段。\n\n第五章第二段。\n\n第五章第三段。\n\n第五章第四段。\n\n第五章第五段。',
    },
  ],
})

const appendBaseProductionBooks = liveProduction.books.map((entry) =>
  entry.book.id === 'book-tide-archive'
    ? { ...entry, chapters: entry.chapters.slice(0, 3) }
    : entry,
)

function createSessionRepository(): AuthoringSessionRepository {
  let session: Parameters<AuthoringSessionRepository['save']>[0] | undefined
  return {
    load: vi.fn(() => session),
    save: vi.fn((nextSession) => {
      session = nextSession
    }),
    clear: vi.fn(() => {
      session = undefined
    }),
  }
}

describe('AuthoringPreviewScreen', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
  })

  it('uses the gateway client to display a draft-only preview with quality results', async () => {
    const gatewayClient = createClient()
    render(
      <AuthoringPreviewScreen
        gatewayClient={gatewayClient}
        onBack={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Draft provider / AI provider not connected'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '一名守夜人發現城市的鐘每天少響一聲。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))

    expect(await screen.findByText('DRAFT / NOT PUBLISHED')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '預覽草稿' })).toBeInTheDocument()
    expect(screen.getByText('第 1 章：第一章')).toBeInTheDocument()
    expect(screen.getByText('第 2 章：第二章')).toBeInTheDocument()
    expect(screen.getByText('HARD_VALIDATION_FAILURE')).toBeInTheDocument()
    expect(screen.getByText('QUALITY_WARNING')).toBeInTheDocument()
    expect(screen.getAllByText(/少於 5 段/)).toHaveLength(2)
    expect(gatewayClient.generateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        premise: '一名守夜人發現城市的鐘每天少響一聲。',
      }),
    )
  })

  it('runs the continuity review workflow through the Authoring Workspace with explicit decisions and checkpoint completion', async () => {
    const projectRepository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      () => 'continuity-project',
    )
    const before = projectRepository.load()
    expect(before.ok).toBe(true)

    const rendered = render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        projectRepository={projectRepository}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '一名守夜人發現城市的鐘每天少響一聲。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))
    expect(await screen.findByRole('heading', { name: '預覽草稿' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review Next Chapters' }))
    expect(await screen.findByDisplayValue(/Role: Novel Story Bible Continuity Review Agent/)).toBeInTheDocument()
    const reviewPrompt = screen.getByDisplayValue(/Role: Novel Story Bible Continuity Review Agent/) as HTMLTextAreaElement
    expect(reviewPrompt.value).toContain('第一段。')
    expect(reviewPrompt.value).toContain('第二段。')

    fireEvent.change(screen.getByLabelText('Proposal JSON (raw JSON only)'), {
      target: {
        value: JSON.stringify({
          proposals: [
            { type: 'ADD_WORLD_RULE', text: '鐘每天少響一聲。', reason: '章節正文支持。' },
            { type: 'ADD_STYLE_NOTE', text: '保持克制。', reason: '拒絕此提案。' },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Parse Proposals' }))
    expect(await screen.findByText('ADD_WORLD_RULE')).toBeInTheDocument()
    const afterImport = projectRepository.load()
    expect(afterImport.ok).toBe(true)
    if (!afterImport.ok) return
    expect(afterImport.store.projects[0]?.session.storyBible).toEqual(createEmptyStoryBible())

    fireEvent.click(screen.getByRole('button', { name: 'Accept proposal 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject proposal 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply Accepted' }))

    await waitFor(() => {
      const stored = projectRepository.load()
      expect(stored.ok).toBe(true)
      if (stored.ok) {
        expect(stored.store.projects[0]?.session.storyBible.worldRules).toEqual(['鐘每天少響一聲。'])
        expect(stored.store.projects[0]?.session.storyBible.styleNotes).toEqual([])
        expect(stored.store.projects[0]?.session.continuityReviewBatch?.status).toBe('APPLIED')
      }
    })
    expect(screen.getByRole('button', { name: 'Complete Review' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Review' }))

    await waitFor(() => {
      const stored = projectRepository.load()
      expect(stored.ok).toBe(true)
      if (stored.ok) {
        expect(stored.store.projects[0]?.session.lastContinuityReviewedSequence).toBe(2)
        expect(stored.store.projects[0]?.session.continuityReviewBatch).toBeUndefined()
      }
    })
    expect(screen.getByText('Continuity review up to date.')).toBeInTheDocument()

    rendered.unmount()
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        projectRepository={projectRepository}
      />,
    )
    expect(screen.getByText('Continuity review up to date.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('鐘每天少響一聲。')).toBeInTheDocument()
  })

  it('keeps active continuity batches isolated while switching projects', async () => {
    const ids = ['project-a', 'project-b']
    const projectRepository = new LocalStorageAuthoringProjectRepository(
      window.localStorage,
      () => ids.shift() ?? 'unexpected-project',
    )
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        projectRepository={projectRepository}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '第一個專案的故事。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))
    expect(await screen.findByRole('heading', { name: '預覽草稿' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review Next Chapters' }))
    expect(await screen.findByDisplayValue(/Role: Novel Story Bible Continuity Review Agent/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('New project name'), { target: { value: 'Project B' } })
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    expect(await screen.findByText('Continuity review up to date.')).toBeInTheDocument()
    const projectB = projectRepository.load()
    expect(projectB.ok).toBe(true)
    if (!projectB.ok) return
    expect(projectB.store.projects.find((project) => project.projectId === 'project-b')?.session.continuityReviewBatch).toBeUndefined()

    fireEvent.change(screen.getByLabelText('Current Project'), { target: { value: 'project-a' } })
    expect(await screen.findByDisplayValue(/Role: Novel Story Bible Continuity Review Agent/)).toBeInTheDocument()
    const projectA = projectRepository.load()
    expect(projectA.ok).toBe(true)
    if (projectA.ok) {
      expect(projectA.store.projects.find((project) => project.projectId === 'project-a')?.session.continuityReviewBatch?.status).toBe('DRAFT')
    }
  })

  it('loads book-tide-archive as a five-chapter continuation and prepares a six-seven append candidate', async () => {
    const sessionRepository = createSessionRepository()
    const productionBook = liveProduction.books.find(
      ({ book }) => book.id === 'book-tide-archive',
    )
    expect(productionBook).toBeDefined()
    if (!productionBook) {
      return
    }

    const snapshot = createPublishedBookSnapshot(
      {
        book: {
          id: productionBook.book.id as string,
          title: productionBook.book.title,
          authorName: productionBook.book.authorName,
          categoryLabel: productionBook.book.categoryLabel,
        },
        catalogSequence: productionBook.catalogSequence,
        description: productionBook.description,
        chapters: productionBook.chapters.map((chapter) => ({
          chapterId: chapter.id as string,
          sequence: chapter.sequence,
          title: chapter.title,
          access: chapter.access,
        })),
      },
      (chapterId) => liveProduction.proseByChapterId.get(chapterId),
    )
    expect(snapshot).toBeDefined()
    if (!snapshot) {
      return
    }
    const baseFingerprint = await fingerprintPublishedBook(snapshot)
    const productionBefore = JSON.stringify(liveProduction)
    const catalogCountBefore = liveProduction.books.length

    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        productionBooks={liveProduction.books}
        productionChapterProse={(chapterId) =>
          liveProduction.proseByChapterId.get(chapterId)
        }
        sessionRepository={sessionRepository}
        validateProductionFixture={(fixture) =>
          parseContentBookFixture(`./books/${fixture.bookId}.json`, fixture)
        }
      />,
    )

    fireEvent.change(screen.getByLabelText('Published Book'), {
      target: { value: 'book-tide-archive' },
    })
    expect(screen.getByText(/將載入「潮汐檔案」的/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue Published Book' }))

    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(10)
    expect(screen.getByText('第 10 章：第十章：未止的鐘聲')).toBeInTheDocument()
    expect(screen.getByText(/Base fingerprint captured/)).toHaveTextContent(baseFingerprint)
    expect(sessionRepository.load()).toEqual(
      expect.objectContaining({
        targetPublishedBookId: 'book-tide-archive',
        basePublishedBookFingerprint: baseFingerprint,
        draft: expect.objectContaining({ chapters: expect.any(Array) }),
      }),
    )

    fireEvent.change(screen.getByLabelText('New Character name'), {
      target: { value: '林澄' },
    })
    fireEvent.change(screen.getByLabelText('New Character notes'), {
      target: { value: '氣象局工作；主角；追查潮汐裝置與父親留下的線索。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Character' }))
    fireEvent.change(screen.getByLabelText('New Character name'), {
      target: { value: '林嶼' },
    })
    fireEvent.change(screen.getByLabelText('New Character notes'), {
      target: { value: '林澄失蹤的哥哥；曾成為潮汐裝置守門人；聲音仍可能存在於回路中。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Character' }))
    fireEvent.change(screen.getByLabelText('New World rule text'), {
      target: { value: '潮汐裝置會記錄沒有被選中的未來。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add world rule' }))
    fireEvent.change(screen.getByLabelText('New World rule text'), {
      target: { value: '部分未被選中的路可能在潮汐壓力下重新靠岸。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add world rule' }))
    fireEvent.change(screen.getByLabelText('New Open thread text'), {
      target: { value: '下一次低潮前找到第一座鐘。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add open thread' }))
    fireEvent.change(screen.getByLabelText('New Open thread text'), {
      target: { value: '確認落後林嶼十一秒的第二個聲音是誰。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add open thread' }))
    fireEvent.change(screen.getByLabelText('New Style note text'), {
      target: { value: '維持克制的科幻懸疑氛圍。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add style note' }))
    fireEvent.change(screen.getByLabelText('New Style note text'), {
      target: { value: '避免用大段 exposition 一次解釋全部世界觀。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add style note' }))
    expect(sessionRepository.load()?.storyBible).toEqual({
      characters: [
        { name: '林澄', notes: '氣象局工作；主角；追查潮汐裝置與父親留下的線索。' },
        { name: '林嶼', notes: '林澄失蹤的哥哥；曾成為潮汐裝置守門人；聲音仍可能存在於回路中。' },
      ],
      worldRules: [
        '潮汐裝置會記錄沒有被選中的未來。',
        '部分未被選中的路可能在潮汐壓力下重新靠岸。',
      ],
      openThreads: [
        '下一次低潮前找到第一座鐘。',
        '確認落後林嶼十一秒的第二個聲音是誰。',
      ],
      styleNotes: [
        '維持克制的科幻懸疑氛圍。',
        '避免用大段 exposition 一次解釋全部世界觀。',
      ],
    })

    fireEvent.change(screen.getByLabelText('Requested next chapters（1–5）'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Continuation Prompt' }))
    expect(
      (screen.getByRole('textbox', {
        name: 'Generated Continuation Prompt',
      }) as HTMLTextAreaElement).value,
    ).toContain('starting at sequence 11')
    const continuationPrompt = (
      screen.getByRole('textbox', {
        name: 'Generated Continuation Prompt',
      }) as HTMLTextAreaElement
    ).value
    expect(
      continuationPrompt.match(
        /林澄: 氣象局工作；主角；追查潮汐裝置與父親留下的線索。/g,
      ),
    ).toHaveLength(1)
    expect(continuationPrompt).toContain('潮汐裝置會記錄沒有被選中的未來。')
    expect(continuationPrompt).toContain('確認落後林嶼十一秒的第二個聲音是誰。')

    const continuationJson = JSON.stringify({
      chapters: [
        {
          sequence: 11,
          title: '第十一章',
          prose: '十一之一。\n\n十一之二。\n\n十一之三。\n\n十一之四。\n\n十一之五。',
        },
        {
          sequence: 12,
          title: '第十二章',
          prose: '十二之一。\n\n十二之二。\n\n十二之三。\n\n十二之四。\n\n十二之五。',
        },
      ],
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Continuation JSON' }), {
      target: { value: continuationJson },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import Continuation' }))
    expect(screen.getByText('品質檢查：STALE')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(12)
    expect(screen.getByText('第 1 章：沉入海底的鐘')).toBeInTheDocument()
    expect(screen.getByText('第 10 章：第十章：未止的鐘聲')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    fireEvent.change(screen.getByDisplayValue('下一次低潮前找到第一座鐘。'), {
      target: { value: '下一次低潮前找到第一座鐘。' },
    })
    expect(screen.queryByText('品質檢查：STALE')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Chapter Append' }))

    expect(await screen.findByText('Proposed appended chapter count：2')).toBeInTheDocument()
    expect(screen.getByText('Append candidate readiness：READY')).toBeInTheDocument()
    expect(screen.getByText('Production validation：PASS')).toBeInTheDocument()
    const candidate = JSON.parse(
      (screen.getByRole('textbox', { name: 'Append Candidate JSON' }) as HTMLTextAreaElement).value,
    ) as {
      appendedChapters: Array<{ sequence: number }>
      updatedFixturePreview: { chapters: unknown[] }
    }
    expect(candidate.appendedChapters.map(({ sequence }) => sequence)).toEqual([11, 12])
    expect(candidate.updatedFixturePreview.chapters).toHaveLength(12)
    expect(sessionRepository.load()?.storyBible.openThreads).toEqual([
      '下一次低潮前找到第一座鐘。',
      '確認落後林嶼十一秒的第二個聲音是誰。',
    ])
    expect(JSON.stringify(liveProduction)).toBe(productionBefore)
    expect(liveProduction.books).toHaveLength(catalogCountBefore)
    expect(productionBook.chapters).toHaveLength(10)
  }, 10_000)

  it('preserves the existing session when replacement is cancelled', async () => {
    const sessionRepository = createSessionRepository()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        productionBooks={liveProduction.books}
        productionChapterProse={(chapterId) =>
          liveProduction.proseByChapterId.get(chapterId)
        }
        sessionRepository={sessionRepository}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '現有草稿的故事前提。' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import Structured Draft' }))
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    const before = sessionRepository.load()

    fireEvent.change(screen.getByLabelText('Published Book'), {
      target: { value: 'book-tide-archive' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Continue Published Book' }))

    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 4 })).toHaveLength(3)
    expect(sessionRepository.load()).toEqual(before)
    confirm.mockRestore()
  })

  it('shows validation feedback returned by the gateway', async () => {
    const gatewayClient = createClient({
      ok: false,
      status: 'validation_error',
      message: '創作規格無效。',
      errors: [
        { code: 'PREMISE_REQUIRED', message: '請輸入故事 premise。' },
      ],
    })
    render(
      <AuthoringPreviewScreen
        gatewayClient={gatewayClient}
        onBack={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請輸入故事 premise。',
    )
  })

  it('shows a bounded provider failure state', async () => {
    const gatewayClient = createClient({
      ok: false,
      status: 'provider_error',
      message: '草稿生成失敗，請稍後再試。',
    })
    render(
      <AuthoringPreviewScreen
        gatewayClient={gatewayClient}
        onBack={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '有效故事前提。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '草稿生成失敗，請稍後再試。',
    )
  })

  it('generates a deterministic prompt and copies it through the clipboard port', async () => {
    const writeText = vi.fn(async () => undefined)
    const clipboardPort: ClipboardPort = { writeText }
    render(
      <AuthoringPreviewScreen
        clipboardPort={clipboardPort}
        gatewayClient={createClient()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '一名守夜人發現城市的鐘每天少響一聲。' },
    })
    fireEvent.change(screen.getByLabelText('故事分類'), {
      target: { value: '科幻懸疑' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agent Prompt' }))

    const prompt = await screen.findByRole('textbox', {
      name: 'Generated Agent Prompt',
    })
    expect((prompt as HTMLTextAreaElement).value).toContain('一名守夜人')
    fireEvent.click(screen.getByRole('button', { name: 'Copy Agent Prompt' }))

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('一名守夜人發現城市的鐘每天少響一聲。'),
    )
    expect(await screen.findByText('Prompt copied.')).toBeInTheDocument()
  })

  it('imports a three-chapter Agent Draft through validation, quality evaluation, and preview', async () => {
    const gatewayClient = createClient()
    render(
      <AuthoringPreviewScreen gatewayClient={gatewayClient} onBack={vi.fn()} />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )

    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    expect(screen.getByText('分類：科幻懸疑')).toBeInTheDocument()
    expect(screen.getByText('第 1 章：沉入海底的鐘')).toBeInTheDocument()
    expect(screen.getByText('第 2 章：舊港的回聲')).toBeInTheDocument()
    expect(screen.getByText('第 3 章：第四點整')).toBeInTheDocument()
    expect(screen.getByText('DRAFT / NOT PUBLISHED')).toBeInTheDocument()
    expect(screen.getByText('驗證狀態：PASS')).toBeInTheDocument()
    expect(screen.getByText('品質檢查：WARNING')).toBeInTheDocument()
    expect(gatewayClient.generateDraft).not.toHaveBeenCalled()
  })

  it('continues a valid three-chapter Draft through prompt, append, stale quality, reload, and full export round-trip', async () => {
    const sessionRepository = createSessionRepository()
    const writeText = vi.fn(async () => undefined)
    const firstRender = render(
      <AuthoringPreviewScreen
        clipboardPort={{ writeText }}
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    const originalTitles = screen
      .getAllByLabelText('章節標題')
      .map((input) => (input as HTMLInputElement).value)
    const originalProse = screen
      .getAllByLabelText('章節正文')
      .map((input) => (input as HTMLTextAreaElement).value)

    fireEvent.change(screen.getByLabelText(/Requested next chapters/), {
      target: { value: '2' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Continuation Prompt' }),
    )
    const prompt = screen.getByRole('textbox', {
      name: 'Generated Continuation Prompt',
    }) as HTMLTextAreaElement
    expect(prompt.value).toContain('starting at sequence 4')
    expect(prompt.value).toContain('exactly 2 new chapter(s)')
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Continuation Prompt' }),
    )
    expect(await screen.findByText('Continuation prompt copied.')).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(prompt.value)

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Continuation JSON' }), {
      target: { value: continuationJson },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import Continuation' }))

    expect(screen.getAllByLabelText('章節標題')).toHaveLength(5)
    expect(
      screen.getAllByLabelText('章節標題').slice(0, 3).map(
        (input) => (input as HTMLInputElement).value,
      ),
    ).toEqual(originalTitles)
    expect(
      screen.getAllByLabelText('章節正文').slice(0, 3).map(
        (input) => (input as HTMLTextAreaElement).value,
      ),
    ).toEqual(originalProse)
    fireEvent.change(screen.getAllByLabelText('章節標題')[3], {
      target: { value: '鐘下的新頁（可編輯）' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[3], {
      target: { value: '第四章已在 Review Workspace 編輯。' },
    })
    expect(screen.getByText('第 4 章：鐘下的新頁（可編輯）')).toBeInTheDocument()
    expect(screen.getByText('第 5 章：潮水回來以前')).toBeInTheDocument()
    expect(screen.getByText('品質檢查：STALE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    expect(screen.getByText('品質檢查：WARNING')).toBeInTheDocument()
    expect(screen.getAllByText(/少於 5 段/)).toHaveLength(5)
    expect(screen.queryByText('品質檢查：STALE')).not.toBeInTheDocument()

    const exportText = screen.getByRole('textbox', {
      name: 'Draft JSON Export',
    }) as HTMLTextAreaElement
    const exported = JSON.parse(exportText.value) as {
      chapters: Array<{ sequence: number; title: string }>
    }
    expect(exported.chapters.map((chapter) => chapter.sequence)).toEqual([
      1, 2, 3, 4, 5,
    ])
    const roundTrip = importAgentDraft(exportText.value)
    expect(roundTrip.ok).toBe(true)
    if (roundTrip.ok) {
      expect(roundTrip.draft.chapters).toHaveLength(5)
      expect(roundTrip.draft.chapters.slice(0, 3).map((chapter) => chapter.title)).toEqual(
        originalTitles,
      )
    }

    firstRender.unmount()
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )
    expect(screen.getAllByLabelText('章節標題')).toHaveLength(5)
    expect(screen.getByText('潮汐檔案')).toBeInTheDocument()
  })

  it('preserves the accepted Draft when a continuation response is invalid', async () => {
    render(
      <AuthoringPreviewScreen gatewayClient={createClient()} onBack={vi.fn()} />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Continuation JSON' }), {
      target: {
        value: JSON.stringify({
          chapters: [
            { sequence: 3, title: '重送舊章', prose: '不應附加。' },
            { sequence: 4, title: '新章', prose: '不應附加。' },
          ],
        }),
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Import Continuation' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'previous accepted Draft was preserved',
    )
    expect(screen.getAllByLabelText('章節標題')).toHaveLength(3)
    expect(screen.getByText('第 3 章：第四點整')).toBeInTheDocument()
    expect(screen.queryByText('第 4 章：新章')).not.toBeInTheDocument()
  })

  it('prepares a deterministic production candidate without an authored access selector', async () => {
    render(
      <AuthoringPreviewScreen gatewayClient={createClient()} onBack={vi.fn()} />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Publication slug'), {
      target: { value: 'tide-archive' },
    })
    fireEvent.change(screen.getByLabelText('Publication author name'), {
      target: { value: '林澄' },
    })
    fireEvent.change(screen.getByLabelText('Publication description'), {
      target: { value: '潮汐帶回遺失的記憶。' },
    })
    fireEvent.change(screen.getByLabelText('Catalog sequence'), {
      target: { value: '13' },
    })

    expect(screen.getByText('Candidate readiness：READY_WITH_WARNINGS')).toBeInTheDocument()
    const candidate = JSON.parse(
      (
        screen.getByRole('textbox', {
          name: 'Publication Candidate JSON',
        }) as HTMLTextAreaElement
      ).value,
    ) as {
      bookId: string
      chapters: Array<{ chapterId: string; access: string }>
    }
    expect(candidate.bookId).toBe('book-tide-archive')
    expect(candidate.chapters.map((chapter) => chapter.chapterId)).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
    ])
    expect(candidate.chapters.map((chapter) => chapter.access)).toEqual([
      'READABLE',
      'READABLE',
      'READABLE',
    ])
    expect(screen.queryByLabelText(/chapter access/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Published target book')).toBeInTheDocument()
  })

  it('prepares, exports, restores, invalidates, and rebuilds a 3→5 published append candidate', async () => {
    const sessionRepository = createSessionRepository()
    const writeText = vi.fn(async () => undefined)
    const productionBefore = JSON.stringify(liveProduction.books)
    const catalogCountBefore = liveProduction.books.length
    const renderScreen = () =>
      render(
        <AuthoringPreviewScreen
          clipboardPort={{ writeText }}
          gatewayClient={createClient()}
          onBack={vi.fn()}
          productionBooks={appendBaseProductionBooks}
          productionChapterProse={(chapterId) =>
            liveProduction.proseByChapterId.get(chapterId)
          }
          sessionRepository={sessionRepository}
          validateProductionFixture={(fixture) =>
            parseContentBookFixture(`./books/${fixture.bookId}.json`, fixture)
          }
        />,
      )

    const firstRender = renderScreen()
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: extendedPublishedDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Published target book'), {
      target: { value: 'book-tide-archive' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Chapter Append' }))

    expect(
      await screen.findByText('Append candidate readiness：READY'),
    ).toBeInTheDocument()
    expect(screen.getByText('Production validation：PASS')).toBeInTheDocument()
    expect(screen.getByText('NOT APPLIED TO PRODUCTION')).toBeInTheDocument()

    const exportedCandidate = JSON.parse(
      (
        screen.getByRole('textbox', {
          name: 'Append Candidate JSON',
        }) as HTMLTextAreaElement
      ).value,
    ) as {
      targetPublishedBookId: string
      publishedChapterCount: number
      appendedChapters: Array<{ chapterId: string; access: string }>
      updatedFixturePreview: { chapters: Array<{ chapterId: string }> }
    }
    expect(exportedCandidate.targetPublishedBookId).toBe('book-tide-archive')
    expect(exportedCandidate.publishedChapterCount).toBe(3)
    expect(exportedCandidate.appendedChapters.map((chapter) => chapter.chapterId)).toEqual([
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
    ])
    expect(exportedCandidate.appendedChapters.map((chapter) => chapter.access)).toEqual([
      'READABLE',
      'READABLE',
    ])
    expect(exportedCandidate.updatedFixturePreview.chapters.map((chapter) => chapter.chapterId)).toEqual([
      'chapter-tide-archive-001',
      'chapter-tide-archive-002',
      'chapter-tide-archive-003',
      'chapter-tide-archive-004',
      'chapter-tide-archive-005',
    ])

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Append Candidate JSON' }),
    )
    expect(await screen.findByText('Append candidate copied.')).toBeInTheDocument()

    firstRender.unmount()
    renderScreen()
    expect(
      await screen.findByText('Append candidate readiness：READY'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Published target book')).toHaveValue(
      'book-tide-archive',
    )

    fireEvent.change(screen.getAllByLabelText('章節標題')[3], {
      target: { value: '編輯後的新頁' },
    })
    expect(screen.queryByLabelText('Append Candidate JSON')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Chapter Append' }))
    expect(
      await screen.findByText('Append candidate readiness：READY'),
    ).toBeInTheDocument()
    expect(JSON.stringify(liveProduction.books)).toBe(productionBefore)
    expect(liveProduction.books).toHaveLength(catalogCountBefore)
  })

  it('supports the full local editing, quality, reorder, and export flow', async () => {
    const writeText = vi.fn(async () => undefined)
    render(
      <AuthoringPreviewScreen
        clipboardPort={{ writeText }}
        gatewayClient={createClient()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('草稿標題'), {
      target: { value: '潮汐檔案（編輯測試）' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[0], {
      target: { value: '第一章已編輯正文。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Chapter' }))
    expect(screen.getAllByLabelText('章節標題')).toHaveLength(4)
    fireEvent.change(screen.getAllByLabelText('章節標題')[3], {
      target: { value: '新增章節' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[3], {
      target: { value: '新增章節正文。' },
    })

    expect(screen.getByText('品質檢查：STALE')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    expect(screen.getByText('品質檢查：WARNING')).toBeInTheDocument()
    expect(screen.queryByText('品質檢查：STALE')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上移第 4 章' }))
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 章' }))

    expect(
      screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent),
    ).toEqual([
      '第 1 章：沉入海底的鐘',
      '第 2 章：新增章節',
      '第 3 章：第四點整',
    ])
    expect(screen.getByText('品質檢查：STALE')).toBeInTheDocument()

    const exportText = screen.getByRole('textbox', {
      name: 'Draft JSON Export',
    }) as HTMLTextAreaElement
    const exported = JSON.parse(exportText.value) as {
      title: string
      genre: string
      chapters: Array<{ sequence: number; title: string; prose: string }>
    }
    expect(exported).toEqual({
      title: '潮汐檔案（編輯測試）',
      genre: '科幻懸疑',
      chapters: [
        {
          sequence: 1,
          title: '沉入海底的鐘',
          prose: '第一章已編輯正文。',
        },
        {
          sequence: 2,
          title: '新增章節',
          prose: '新增章節正文。',
        },
        {
          sequence: 3,
          title: '第四點整',
          prose: '第一段潮汐停住。\n\n第二段空白浮出水面。',
        },
      ],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))
    expect(writeText).toHaveBeenCalledWith(exportText.value)
  })

  it('keeps the current Draft JSON selectable when clipboard copy fails', async () => {
    render(
      <AuthoringPreviewScreen
        clipboardPort={{
          writeText: vi.fn(async () => {
            throw new Error('clipboard denied')
          }),
        }}
        gatewayClient={createClient()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    const exportText = screen.getByRole('textbox', {
      name: 'Draft JSON Export',
    }) as HTMLTextAreaElement
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }))

    expect(await screen.findByText(/請選取下方 JSON/)).toBeInTheDocument()
    expect(exportText.value).toContain('潮汐檔案')
  })

  it('proves the full 潮汐檔案 edit, restore, export, and re-import journey', async () => {
    const sessionRepository = createSessionRepository()
    const firstRender = render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('草稿標題'), {
      target: { value: '潮汐檔案（完整驗收）' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[0], {
      target: { value: '第一章已編輯正文。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Chapter' }))
    expect(screen.getByText('驗證狀態：FAIL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy JSON' })).toBeDisabled()
    fireEvent.change(screen.getAllByLabelText('章節標題')[3], {
      target: { value: '新增驗收章節' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[3], {
      target: { value: '新增驗收正文。' },
    })
    fireEvent.click(screen.getByRole('button', { name: '上移第 4 章' }))
    fireEvent.click(screen.getByRole('button', { name: '移除第 2 章' }))

    expect(
      screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent),
    ).toEqual([
      '第 1 章：沉入海底的鐘',
      '第 2 章：新增驗收章節',
      '第 3 章：第四點整',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Re-check Quality' }))
    expect(screen.getByText('品質檢查：WARNING')).toBeInTheDocument()

    firstRender.unmount()
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    expect(screen.getByRole('heading', { name: '潮汐檔案（完整驗收）' })).toBeInTheDocument()
    expect(screen.getByLabelText('草稿標題')).toHaveValue('潮汐檔案（完整驗收）')
    expect(screen.getAllByLabelText('章節正文')[0]).toHaveValue(
      '第一章已編輯正文。',
    )
    expect(
      screen.getAllByRole('heading', { level: 4 }).map((heading) => heading.textContent),
    ).toEqual([
      '第 1 章：沉入海底的鐘',
      '第 2 章：新增驗收章節',
      '第 3 章：第四點整',
    ])

    const exported = (
      screen.getByRole('textbox', { name: 'Draft JSON Export' }) as HTMLTextAreaElement
    ).value
    const roundTrip = importAgentDraft(exported)
    expect(roundTrip.ok).toBe(true)
    if (roundTrip.ok) {
      expect({
        title: roundTrip.draft.title,
        genre: roundTrip.draft.categoryLabel,
        chapters: roundTrip.draft.chapters,
      }).toEqual({
        title: '潮汐檔案（完整驗收）',
        genre: '科幻懸疑',
        chapters: [
          {
            sequence: 1,
            title: '沉入海底的鐘',
            prose: ['第一章已編輯正文。'],
          },
          {
            sequence: 2,
            title: '新增驗收章節',
            prose: ['新增驗收正文。'],
          },
          {
            sequence: 3,
            title: '第四點整',
            prose: ['第一段潮汐停住。', '第二段空白浮出水面。'],
          },
        ],
      })
    }
  })

  it('preserves the previous accepted Draft when a later import is invalid', async () => {
    render(
      <AuthoringPreviewScreen gatewayClient={createClient()} onBack={vi.fn()} />,
    )
    const input = screen.getByRole('textbox', { name: 'Raw Agent JSON' })

    fireEvent.change(input, { target: { value: agentDraftJson } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: '{broken json' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'previous accepted Draft was preserved',
    )
    expect(screen.getByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
  })

  it('keeps the prompt selectable when clipboard copy fails', async () => {
    const clipboardPort: ClipboardPort = {
      writeText: vi.fn(async () => {
        throw new Error('clipboard denied')
      }),
    }
    render(
      <AuthoringPreviewScreen
        clipboardPort={clipboardPort}
        gatewayClient={createClient()}
        onBack={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '有效故事前提。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agent Prompt' }))
    const prompt = await screen.findByRole('textbox', {
      name: 'Generated Agent Prompt',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy Agent Prompt' }))

    expect(await screen.findByText(/無法自動複製/)).toBeInTheDocument()
    expect((prompt as HTMLTextAreaElement).value).toContain('有效故事前提')
  })

  it('restores the Authoring Spec, prompt, accepted Draft, and quality result after reload', async () => {
    const sessionRepository = createSessionRepository()
    const firstRender = render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    fireEvent.change(screen.getByLabelText('故事前提'), {
      target: { value: '潮水每天提早一分鐘退去。' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate Agent Prompt' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('草稿標題'), {
      target: { value: '潮汐檔案（重新編輯）' },
    })
    fireEvent.change(screen.getAllByLabelText('章節正文')[0], {
      target: { value: '重新編輯的第一章正文。' },
    })
    firstRender.unmount()

    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    expect(screen.getByDisplayValue('潮水每天提早一分鐘退去。')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '潮汐檔案（重新編輯）' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('草稿標題')).toHaveValue('潮汐檔案（重新編輯）')
    expect(screen.getAllByLabelText('章節正文')[0]).toHaveValue(
      '重新編輯的第一章正文。',
    )
    expect(
      (screen.getByRole('textbox', {
        name: 'Generated Agent Prompt',
      }) as HTMLTextAreaElement).value,
    ).toContain('潮水每天提早一分鐘退去。')
    expect(screen.getByText('DRAFT / NOT PUBLISHED')).toBeInTheDocument()
    expect(screen.getByText('品質檢查：WARNING')).toBeInTheDocument()
  })

  it('clears only the authoring session and resets the current screen', async () => {
    const sessionRepository = createSessionRepository()
    render(
      <AuthoringPreviewScreen
        gatewayClient={createClient()}
        onBack={vi.fn()}
        sessionRepository={sessionRepository}
      />,
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Raw Agent JSON' }), {
      target: { value: agentDraftJson },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Import Structured Draft' }),
    )
    expect(await screen.findByRole('heading', { name: '潮汐檔案' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Clear Draft / Start New' }))

    expect(sessionRepository.clear).toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: '潮汐檔案' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('故事前提')).toHaveValue('')
  })
})
