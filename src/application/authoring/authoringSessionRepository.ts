import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import type { PublicationPreparationMetadata } from '../../domain/authoring/publicationCandidate'

export interface AuthoringSession {
  readonly spec: AuthoringSpec
  readonly agentPrompt?: string
  readonly continuationPrompt?: string
  readonly draft?: Draft
  readonly publicationPreparation?: PublicationPreparationMetadata
}

export interface AuthoringSessionRepository {
  load(): AuthoringSession | undefined
  save(session: AuthoringSession): void
  clear(): void
}
