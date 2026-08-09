import type { Draft, AuthoringSpecValidationError } from '../../domain/authoring/authoringContracts'
import type { DraftQualityResult } from '../../domain/authoring/qualityEvaluator'

export interface AuthoringGatewayRequest {
  readonly premise: string
  readonly genre: string
  readonly titleHint?: string
  readonly instructions?: string
  readonly requestedChapterCount?: number
}

export type AuthoringGatewayErrorCode =
  | 'INVALID_REQUEST'
  | 'GENERATION_FAILED'
  | 'INTERNAL_ERROR'

export interface AuthoringGatewayError {
  readonly code: AuthoringGatewayErrorCode
  readonly message: string
  readonly validationErrors?: readonly AuthoringSpecValidationError[]
}

export type AuthoringGatewayResponse =
  | {
      readonly ok: true
      readonly draft: Draft
      readonly quality: DraftQualityResult
      readonly providerName: string
    }
  | {
      readonly ok: false
      readonly error: AuthoringGatewayError
    }
