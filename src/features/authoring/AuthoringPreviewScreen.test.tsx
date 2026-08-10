import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import type { AuthoringSessionRepository } from '../../application/authoring/authoringSessionRepository'
import type { ClipboardPort } from '../../application/authoring/clipboardPort'
import type { GeneratedDraft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import { AuthoringPreviewScreen } from './AuthoringPreviewScreen'

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
