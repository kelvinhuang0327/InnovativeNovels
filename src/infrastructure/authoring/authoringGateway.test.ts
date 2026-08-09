import { describe, expect, it } from 'vitest'
import type { GenerationProvider } from '../../application/authoring/generationProvider'
import { createAuthoringGatewayHandler } from './authoringGateway'

const validBody = JSON.stringify({
  premise: '守夜人發現城市的鐘少響一聲。',
  genre: '懸疑',
  requestedChapterCount: 3,
})

describe('authoring gateway handler', () => {
  it('returns a deterministic draft and quality result for a valid request', async () => {
    const handler = createAuthoringGatewayHandler()

    const result = await handler({ method: 'POST', body: validBody })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      providerName: 'deterministic-local-demo',
      draft: {
        status: 'DRAFT',
        title: '懸疑故事預覽',
        chapters: [{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }],
      },
    })
    if (result.body.ok) {
      expect(result.body.quality).toEqual(result.body.draft.quality)
    }
  })

  it('rejects malformed JSON, wrong shapes, and arbitrary fields at the boundary', async () => {
    const provider: GenerationProvider = {
      name: 'should-not-run',
      generateDraft: async () => {
        throw new Error('provider should not run')
      },
    }
    const handler = createAuthoringGatewayHandler({ provider })

    const malformed = await handler({ method: 'POST', body: '{' })
    const wrongShape = await handler({
      method: 'POST',
      body: JSON.stringify({ premise: 7, genre: '懸疑' }),
    })
    const arbitraryField = await handler({
      method: 'POST',
      body: JSON.stringify({
        premise: '前提',
        genre: '懸疑',
        unexpectedInternalField: true,
      }),
    })

    for (const result of [malformed, wrongShape, arbitraryField]) {
      expect(result.status).toBe(400)
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      })
    }
  })

  it('maps provider failures to a stable generation failure without leaking details', async () => {
    const provider: GenerationProvider = {
      name: 'failing-provider',
      generateDraft: async () => {
        throw new Error('provider details and stack details')
      },
    }
    const handler = createAuthoringGatewayHandler({ provider })

    const result = await handler({ method: 'POST', body: validBody })

    expect(result.status).toBe(502)
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: 'GENERATION_FAILED',
        message: '草稿生成失敗，請稍後再試。',
      },
    })
  })

  it('maps unexpected application failures to a stable internal gateway failure', async () => {
    const handler = createAuthoringGatewayHandler({
      createDraft: async () => {
        throw new Error('internal stack details')
      },
    })

    const result = await handler({ method: 'POST', body: validBody })

    expect(result.status).toBe(500)
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '創作預覽暫時無法處理。',
      },
    })
  })
})
