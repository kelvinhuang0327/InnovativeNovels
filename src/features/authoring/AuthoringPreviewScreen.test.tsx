import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GenerationProvider } from '../../application/authoring/generationProvider'
import { AuthoringPreviewScreen } from './AuthoringPreviewScreen'

function createProvider(): GenerationProvider {
  return {
    name: 'test-draft-provider',
    generateDraft: vi.fn(async () => ({
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
    })),
  }
}

describe('AuthoringPreviewScreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('accepts a spec and displays a draft-only ordered preview with quality results', async () => {
    render(
      <AuthoringPreviewScreen onBack={vi.fn()} provider={createProvider()} />,
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
  })

  it('shows validation feedback without invoking the provider', async () => {
    const provider = createProvider()
    render(<AuthoringPreviewScreen onBack={vi.fn()} provider={provider} />)

    fireEvent.click(screen.getByRole('button', { name: '產生草稿預覽' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '請輸入故事 premise。',
    )
    expect(provider.generateDraft).not.toHaveBeenCalled()
  })
})
