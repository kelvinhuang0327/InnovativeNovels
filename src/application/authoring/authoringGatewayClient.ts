import type {
  AuthoringSpec,
  AuthoringSpecValidationError,
  Draft,
} from '../../domain/authoring/authoringContracts'
import type { DraftQualityResult } from '../../domain/authoring/qualityEvaluator'
import type {
  AuthoringGatewayRequest,
  AuthoringGatewayResponse,
} from './authoringGatewayContracts'

export const AUTHORING_GATEWAY_ENDPOINT = '/api/authoring/generate'

export type AuthoringGatewayClientResult =
  | {
      readonly ok: true
      readonly draft: Draft
      readonly quality: DraftQualityResult
      readonly providerName: string
    }
  | {
      readonly ok: false
      readonly status:
        | 'validation_error'
        | 'provider_error'
        | 'internal_error'
      readonly message: string
      readonly errors?: readonly AuthoringSpecValidationError[]
    }

export interface AuthoringGatewayClient {
  generateDraft(spec: AuthoringSpec): Promise<AuthoringGatewayClientResult>
}

export interface AuthoringGatewayClientOptions {
  readonly endpoint?: string
  readonly fetchImpl?: typeof fetch
  readonly timeoutMs?: number
}

export interface AuthoringGatewayStatus {
  readonly configured: boolean
  readonly providerName: string | null
}

const INTERNAL_GATEWAY_ERROR = '創作預覽暫時無法處理。'
const GENERATION_GATEWAY_ERROR = '草稿生成失敗，請稍後再試。'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isGatewayResponse(value: unknown): value is AuthoringGatewayResponse {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return false
  }

  if (value.ok) {
    return (
      isRecord(value.draft) &&
      isRecord(value.quality) &&
      typeof value.providerName === 'string'
    )
  }

  const error = value.error
  return (
    isRecord(error) &&
    (error.code === 'INVALID_REQUEST' ||
      error.code === 'GENERATION_FAILED' ||
      error.code === 'INTERNAL_ERROR') &&
    typeof error.message === 'string'
  )
}

export class AuthoringGatewayClientAdapter implements AuthoringGatewayClient {
  private readonly endpoint: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor({
    endpoint = AUTHORING_GATEWAY_ENDPOINT,
    fetchImpl = (input, init) => globalThis.fetch(input, init),
    timeoutMs = 125_000,
  }: AuthoringGatewayClientOptions = {}) {
    this.endpoint = endpoint
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async getStatus(): Promise<AuthoringGatewayStatus> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3_000)
    try {
      const response = await this.fetchImpl('/api/authoring/status', {
        cache: 'no-store',
        signal: controller.signal,
      })
      const value: unknown = await response.json()
      if (
        response.ok &&
        isRecord(value) &&
        value.configured === true &&
        typeof value.providerName === 'string' &&
        value.providerName.startsWith('ollama:')
      ) {
        return { configured: true, providerName: value.providerName }
      }
    } catch {
      // Static and offline builds keep manual authoring available.
    } finally {
      clearTimeout(timer)
    }
    return { configured: false, providerName: null }
  }

  async generateDraft(
    spec: AuthoringSpec,
  ): Promise<AuthoringGatewayClientResult> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.request(spec, controller.signal)
    } finally {
      clearTimeout(timer)
    }
  }

  private async request(
    spec: AuthoringSpec,
    signal: AbortSignal,
  ): Promise<AuthoringGatewayClientResult> {
    const request: AuthoringGatewayRequest = {
      premise: spec.premise,
      genre: spec.genre,
      titleHint: spec.titleHint,
      instructions: spec.instructions,
      requestedChapterCount: spec.requestedChapterCount,
    }

    let response: Response
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
        signal,
      })
    } catch {
      return {
        ok: false,
        status: 'internal_error',
        message: INTERNAL_GATEWAY_ERROR,
      }
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      return {
        ok: false,
        status: 'internal_error',
        message: INTERNAL_GATEWAY_ERROR,
      }
    }

    if (!isGatewayResponse(payload)) {
      return {
        ok: false,
        status: 'internal_error',
        message: INTERNAL_GATEWAY_ERROR,
      }
    }

    if (payload.ok && response.ok) {
      return payload
    }

    if (payload.ok) {
      return {
        ok: false,
        status: 'internal_error',
        message: INTERNAL_GATEWAY_ERROR,
      }
    }

    if (payload.error.code === 'INVALID_REQUEST') {
      return {
        ok: false,
        status: 'validation_error',
        message: payload.error.message,
        errors: payload.error.validationErrors,
      }
    }

    if (payload.error.code === 'GENERATION_FAILED') {
      return {
        ok: false,
        status: 'provider_error',
        message: GENERATION_GATEWAY_ERROR,
      }
    }

    return {
      ok: false,
      status: 'internal_error',
      message: INTERNAL_GATEWAY_ERROR,
    }
  }
}
