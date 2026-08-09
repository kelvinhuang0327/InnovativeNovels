import type { DraftQualityResult } from './qualityEvaluator'

export const DEFAULT_REQUESTED_CHAPTER_COUNT = 3
export const MAX_REQUESTED_CHAPTER_COUNT = 6

export interface AuthoringSpec {
  readonly premise: string
  readonly genre: string
  readonly titleHint?: string
  readonly instructions?: string
  readonly requestedChapterCount?: number
}

export interface GenerationRequest {
  readonly premise: string
  readonly genre: string
  readonly titleHint?: string
  readonly instructions?: string
  readonly requestedChapterCount: number
}

export interface DraftChapter {
  readonly sequence: number
  readonly title: string
  readonly prose: readonly string[]
}

export interface GeneratedDraft {
  readonly title: string
  readonly categoryLabel: string
  readonly chapters: readonly DraftChapter[]
}

export type DraftStatus = 'DRAFT'

export interface Draft extends GeneratedDraft {
  readonly status: DraftStatus
  readonly quality: DraftQualityResult
}

export interface AuthoringSpecValidationError {
  readonly code:
    | 'PREMISE_REQUIRED'
    | 'GENRE_REQUIRED'
    | 'CHAPTER_COUNT_INVALID'
  readonly message: string
}

export function validateAuthoringSpec(
  spec: AuthoringSpec,
): readonly AuthoringSpecValidationError[] {
  const errors: AuthoringSpecValidationError[] = []

  if (spec.premise.trim().length === 0) {
    errors.push({ code: 'PREMISE_REQUIRED', message: '請輸入故事 premise。' })
  }

  if (spec.genre.trim().length === 0) {
    errors.push({ code: 'GENRE_REQUIRED', message: '請輸入故事分類。' })
  }

  if (
    spec.requestedChapterCount !== undefined &&
    (!Number.isInteger(spec.requestedChapterCount) ||
      spec.requestedChapterCount < 1 ||
      spec.requestedChapterCount > MAX_REQUESTED_CHAPTER_COUNT)
  ) {
    errors.push({
      code: 'CHAPTER_COUNT_INVALID',
      message: `章節數必須是 1 到 ${MAX_REQUESTED_CHAPTER_COUNT} 的整數。`,
    })
  }

  return errors
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function buildGenerationRequest(
  spec: AuthoringSpec,
): GenerationRequest {
  return {
    premise: spec.premise.trim(),
    genre: spec.genre.trim(),
    titleHint: trimOptional(spec.titleHint),
    instructions: trimOptional(spec.instructions),
    requestedChapterCount:
      spec.requestedChapterCount ?? DEFAULT_REQUESTED_CHAPTER_COUNT,
  }
}
