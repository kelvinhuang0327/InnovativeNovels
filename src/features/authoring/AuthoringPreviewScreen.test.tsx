import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
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
})
