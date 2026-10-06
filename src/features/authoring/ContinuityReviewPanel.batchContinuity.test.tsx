import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ContinuityReviewPanel } from './ContinuityReviewPanel'
import { importAgentDraft } from '../../application/authoring/agentDraftImport'
import { createEmptyStoryBible } from '../../domain/authoring/storyBible'

afterEach(cleanup)

describe('batch warning in the existing continuity panel', () => {
  it('shows source chapters, exact observations and Bible references without accepting changes', () => {
    const imported = importAgentDraft(JSON.stringify({ title: '合成', genre: '懸疑', chapters: [
      { sequence: 1, title: '一', prose: '鐘停止。', metadata: { keyEvents: ['鐘停止'], setups: ['缺角鑰匙'] } },
      { sequence: 2, title: '二', prose: '旅人休息。' },
    ] }))
    if (!imported.ok) throw new Error('Fixture import failed')
    const apply = vi.fn()
    render(<ContinuityReviewPanel draft={imported.draft} spec={{ premise: '合成', genre: '懸疑' }} storyBible={{ ...createEmptyStoryBible(), openThreads: ['缺角鑰匙'] }} checkpoint={0} onApply={apply} onBatchChange={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '跨章因果／伏筆提示' })).toBeVisible()
    expect(screen.getByText('metadata.keyEvents：鐘停止')).toBeVisible()
    expect(screen.getAllByText('來源章節：1；檢視章節：2')).toHaveLength(2)
    expect(screen.getByText(/不證明故事正確/)).toBeVisible()
    expect(screen.getByText('Story Bible 開放伏筆字面參照（不代表已回收）')).toBeVisible()
    expect(apply).not.toHaveBeenCalled()
  })

  it('reports insufficient observations for old metadata-free drafts', () => {
    const imported = importAgentDraft(JSON.stringify({ title: '合成', genre: '懸疑', chapters: [{ sequence: 1, title: '一', prose: '正文。' }] }))
    if (!imported.ok) throw new Error('Fixture import failed')
    render(<ContinuityReviewPanel draft={imported.draft} spec={{ premise: '合成', genre: '懸疑' }} storyBible={createEmptyStoryBible()} checkpoint={0} onApply={vi.fn()} onBatchChange={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText(/資料不足：至少兩章/)).toBeVisible()
  })
})
