import type {
  GeneratedDraft,
  GenerationRequest,
} from '../../domain/authoring/authoringContracts'

export interface GenerationProvider {
  readonly name: string
  generateDraft(request: GenerationRequest): Promise<GeneratedDraft>
}
