import {
  createAuthoringDraft,
  type CreateDraftResult,
  type CreateDraftDependencies,
} from '../../application/authoring/createDraftUseCase.js'
import type {
  AuthoringSpec,
  AuthoringSpecValidationError,
} from '../../domain/authoring/authoringContracts.js'
import type { GenerationProvider } from '../../application/authoring/generationProvider.js'
import type {
  AuthoringGatewayRequest,
  AuthoringGatewayResponse,
} from '../../application/authoring/authoringGatewayContracts.js'
import { DeterministicDraftProvider } from './deterministicDraftProvider.js'

export const AUTHORING_GATEWAY_PATH = '/api/authoring/generate'

export interface AuthoringGatewayHttpRequest {
  readonly method: string
  readonly body: string
}

export interface AuthoringGatewayHttpResponse {
  readonly status: number
  readonly body: AuthoringGatewayResponse
}

export interface AuthoringGatewayDependencies {
  readonly provider?: GenerationProvider
  readonly createDraft?: (
    spec: AuthoringSpec,
    dependencies: CreateDraftDependencies,
  ) => Promise<CreateDraftResult>
}

type ParsedRequest =
  | { readonly ok: true; readonly spec: AuthoringSpec }
  | { readonly ok: false; readonly message: string }

const ALLOWED_REQUEST_FIELDS = new Set([
  'premise',
  'genre',
  'titleHint',
  'instructions',
  'requestedChapterCount',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRequest(payload: unknown): ParsedRequest {
  if (!isRecord(payload)) {
    return { ok: false, message: '請提供創作規格物件。' }
  }

  const unknownField = Object.keys(payload).find(
    (field) => !ALLOWED_REQUEST_FIELDS.has(field),
  )
  if (unknownField) {
    return { ok: false, message: '請只提供創作規格所需欄位。' }
  }

  if (typeof payload.premise !== 'string') {
    return { ok: false, message: '故事前提格式錯誤。' }
  }

  if (typeof payload.genre !== 'string') {
    return { ok: false, message: '故事分類格式錯誤。' }
  }

  for (const field of ['titleHint', 'instructions'] as const) {
    if (field in payload && payload[field] !== undefined && typeof payload[field] !== 'string') {
      return { ok: false, message: '選填創作欄位格式錯誤。' }
    }
  }

  if (
    'requestedChapterCount' in payload &&
    payload.requestedChapterCount !== undefined &&
    typeof payload.requestedChapterCount !== 'number'
  ) {
    return { ok: false, message: '章節數格式錯誤。' }
  }

  return {
    ok: true,
    spec: payload as unknown as AuthoringGatewayRequest,
  }
}

function invalidRequest(
  message: string,
  validationErrors?: readonly AuthoringSpecValidationError[],
): AuthoringGatewayHttpResponse {
  return {
    status: 400,
    body: {
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        message,
        validationErrors,
      },
    },
  }
}

function internalFailure(): AuthoringGatewayHttpResponse {
  return {
    status: 500,
    body: {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: '創作預覽暫時無法處理。',
      },
    },
  }
}

function mapApplicationResult(
  result: CreateDraftResult,
): AuthoringGatewayHttpResponse {
  if (result.ok) {
    return {
      status: 200,
      body: {
        ok: true,
        draft: result.draft,
        quality: result.draft.quality,
        providerName: result.providerName,
      },
    }
  }

  if (result.status === 'validation_error') {
    return invalidRequest('創作規格無效。', result.errors)
  }

  if (result.status === 'provider_error') {
    return {
      status: 502,
      body: {
        ok: false,
        error: {
          code: 'GENERATION_FAILED',
          message: '草稿生成失敗，請稍後再試。',
        },
      },
    }
  }

  return internalFailure()
}

export function createAuthoringGatewayHandler(
  dependencies: AuthoringGatewayDependencies = {},
): (request: AuthoringGatewayHttpRequest) => Promise<AuthoringGatewayHttpResponse> {
  const provider = dependencies.provider ?? new DeterministicDraftProvider()
  const createDraft = dependencies.createDraft ?? createAuthoringDraft

  return async ({ method, body }) => {
    if (method !== 'POST') {
      return invalidRequest('此端點只接受 POST 請求。')
    }

    let payload: unknown
    try {
      payload = JSON.parse(body) as unknown
    } catch {
      return invalidRequest('請提供有效的 JSON 創作規格。')
    }

    const parsed = parseRequest(payload)
    if (!parsed.ok) {
      return invalidRequest(parsed.message)
    }

    try {
      return mapApplicationResult(
        await createDraft(parsed.spec, { provider }),
      )
    } catch {
      return internalFailure()
    }
  }
}
