import { describe, expect, it } from 'vitest'
import { DeterministicDraftProvider } from './deterministicDraftProvider'

describe('DeterministicDraftProvider', () => {
  it('returns stable ordered demo chapters without external execution', async () => {
    const provider = new DeterministicDraftProvider()
    const request = {
      premise: '守夜人發現城市的鐘少響一聲。',
      genre: '懸疑',
      requestedChapterCount: 3,
    }

    const first = await provider.generateDraft(request)
    const second = await provider.generateDraft(request)

    expect(provider.name).toBe('deterministic-local-demo')
    expect(first).toEqual(second)
    expect(first.chapters.map((chapter) => chapter.sequence)).toEqual([1, 2, 3])
    expect(first.chapters).toHaveLength(3)
  })
})
