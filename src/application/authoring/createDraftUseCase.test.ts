import { describe, expect, it, vi } from 'vitest'
import type {
  GeneratedDraft,
  GenerationRequest,
} from '../../domain/authoring/authoringContracts'
import { createAuthoringDraft } from './createDraftUseCase'
import type { GenerationProvider } from './generationProvider'

const generatedDraft: GeneratedDraft = {
  title: '測試草稿',
  categoryLabel: '懸疑',
  chapters: [
    {
      sequence: 1,
      title: '第一章',
      prose: ['一段內容。', '另一段內容。'],
    },
  ],
}

function makeProvider(
  generateDraft: GenerationProvider['generateDraft'],
): GenerationProvider {
  return { name: 'test-provider', generateDraft }
}

describe('createAuthoringDraft', () => {
  it('builds a request, invokes the provider, and returns a draft with quality', async () => {
    const request: GenerationRequest = {
      premise: '一個測試 premise。',
      genre: '懸疑',
      requestedChapterCount: 1,
    }
    const generateDraft = vi.fn(async (receivedRequest: GenerationRequest) => {
      expect(receivedRequest).toEqual(request)
      return generatedDraft
    })

    const result = await createAuthoringDraft(
      {
        premise: request.premise,
        genre: request.genre,
        requestedChapterCount: request.requestedChapterCount,
      },
      { provider: makeProvider(generateDraft) },
    )

    expect(generateDraft).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.draft.status).toBe('DRAFT')
      expect(result.draft.title).toBe('測試草稿')
      expect(result.draft.quality.status).toBe('WARNING')
    }
  })

  it('does not invoke the provider for an empty premise', async () => {
    const generateDraft = vi.fn(async () => generatedDraft)

    const result = await createAuthoringDraft(
      { premise: '', genre: '懸疑' },
      { provider: makeProvider(generateDraft) },
    )

    expect(generateDraft).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      ok: false,
      status: 'validation_error',
    })
  })

  it('propagates provider failures as an application result', async () => {
    const providerError = new Error('provider unavailable')
    const result = await createAuthoringDraft(
      { premise: '一個測試 premise。', genre: '懸疑' },
      {
        provider: makeProvider(async () => {
          throw providerError
        }),
      },
    )

    expect(result).toEqual({
      ok: false,
      status: 'provider_error',
      error: providerError,
    })
  })
})
