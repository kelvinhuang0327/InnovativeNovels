import { describe, expect, it, vi } from 'vitest'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import type { AuthoringGatewayResponse } from './authoringGatewayContracts'
import { AuthoringGatewayClientAdapter } from './authoringGatewayClient'

const spec = {
  premise: '一名守夜人發現城市的鐘每天少響一聲。',
  genre: '懸疑',
  titleHint: '失去的一秒',
  instructions: '保持節制。',
  requestedChapterCount: 3,
}

const generatedDraft = {
  title: '失去的一秒',
  categoryLabel: '懸疑',
  chapters: [
    { sequence: 1, title: '第一章', prose: ['第一段。'] },
  ],
}
const quality = evaluateDraftQuality(generatedDraft)
const successResponse: AuthoringGatewayResponse = {
  ok: true,
  draft: { ...generatedDraft, status: 'DRAFT', quality },
  quality,
  providerName: 'deterministic-local-demo',
}

function responseFor(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('AuthoringGatewayClientAdapter', () => {
  it('posts only the authoring gateway request and returns the stable result', async () => {
    const fetchImpl = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        void input
        void init
        return responseFor(successResponse)
      },
    )
    const client = new AuthoringGatewayClientAdapter({ fetchImpl })

    const result = await client.generateDraft(spec)

    expect(result).toEqual(successResponse)
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/authoring/generate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    )
    const requestInit = fetchImpl.mock.calls[0]?.[1]
    expect(JSON.parse(String(requestInit?.body))).toEqual(spec)
  })

  it('maps invalid requests, provider failures, and internal failures', async () => {
    const cases: Array<{
      code: 'INVALID_REQUEST' | 'GENERATION_FAILED' | 'INTERNAL_ERROR'
      expectedStatus: 'validation_error' | 'provider_error' | 'internal_error'
      message: string
    }> = [
      {
        code: 'INVALID_REQUEST',
        expectedStatus: 'validation_error',
        message: '創作規格無效。',
      },
      {
        code: 'GENERATION_FAILED',
        expectedStatus: 'provider_error',
        message: '草稿生成失敗，請稍後再試。',
      },
      {
        code: 'INTERNAL_ERROR',
        expectedStatus: 'internal_error',
        message: '創作預覽暫時無法處理。',
      },
    ]

    for (const testCase of cases) {
      const fetchImpl = vi.fn(async () =>
        responseFor({
          ok: false,
          error: { code: testCase.code, message: testCase.message },
        }, 500),
      )
      const client = new AuthoringGatewayClientAdapter({ fetchImpl })

      await expect(client.generateDraft(spec)).resolves.toMatchObject({
        ok: false,
        status: testCase.expectedStatus,
        message: testCase.message,
      })
    }
  })

  it('turns network and malformed gateway responses into a bounded internal failure', async () => {
    const networkClient = new AuthoringGatewayClientAdapter({
      fetchImpl: vi.fn(async () => {
        throw new Error('network details')
      }),
    })
    const malformedClient = new AuthoringGatewayClientAdapter({
      fetchImpl: vi.fn(async () => responseFor({ unexpected: true })),
    })

    await expect(networkClient.generateDraft(spec)).resolves.toEqual({
      ok: false,
      status: 'internal_error',
      message: '創作預覽暫時無法處理。',
    })
    await expect(malformedClient.generateDraft(spec)).resolves.toEqual({
      ok: false,
      status: 'internal_error',
      message: '創作預覽暫時無法處理。',
    })
  })
})
