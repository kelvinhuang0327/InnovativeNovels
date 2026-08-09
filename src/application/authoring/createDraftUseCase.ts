import type {
  AuthoringSpec,
  Draft,
  GeneratedDraft,
  GenerationRequest,
} from '../../domain/authoring/authoringContracts'
import {
  buildGenerationRequest,
  validateAuthoringSpec,
} from '../../domain/authoring/authoringContracts'
import {
  evaluateDraftQuality,
} from '../../domain/authoring/qualityEvaluator'
import type { GenerationProvider } from './generationProvider'

export type CreateDraftResult =
  | {
      readonly ok: true
      readonly request: GenerationRequest
      readonly draft: Draft
      readonly providerName: string
    }
  | {
      readonly ok: false
      readonly status: 'validation_error' | 'provider_error'
      readonly errors?: ReturnType<typeof validateAuthoringSpec>
      readonly error?: Error
    }

export interface CreateDraftDependencies {
  readonly provider: GenerationProvider
}

function normalizeGeneratedDraft(generated: GeneratedDraft): GeneratedDraft {
  return {
    title: generated.title.trim(),
    categoryLabel: generated.categoryLabel.trim(),
    chapters: generated.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title.trim(),
      prose: chapter.prose.map((paragraph) => paragraph.trim()),
    })),
  }
}

export async function createAuthoringDraft(
  spec: AuthoringSpec,
  dependencies: CreateDraftDependencies,
): Promise<CreateDraftResult> {
  const validationErrors = validateAuthoringSpec(spec)
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 'validation_error',
      errors: validationErrors,
    }
  }

  const request = buildGenerationRequest(spec)

  try {
    const generated = normalizeGeneratedDraft(
      await dependencies.provider.generateDraft(request),
    )
    const draft: Draft = {
      ...generated,
      status: 'DRAFT',
      quality: evaluateDraftQuality(generated),
    }

    return {
      ok: true,
      request,
      draft,
      providerName: dependencies.provider.name,
    }
  } catch (error) {
    return {
      ok: false,
      status: 'provider_error',
      error: error instanceof Error ? error : new Error('草稿提供者失敗。'),
    }
  }
}
