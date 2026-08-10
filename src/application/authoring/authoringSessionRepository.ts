import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import type { PublicationPreparationMetadata } from '../../domain/authoring/publicationCandidate'
import type { PublishedAppendCandidate } from '../../domain/authoring/publishedAppendCandidate'

export interface AuthoringSession {
  readonly spec: AuthoringSpec
  readonly agentPrompt?: string
  readonly continuationPrompt?: string
  readonly draft?: Draft
  readonly publicationPreparation?: PublicationPreparationMetadata
  readonly targetPublishedBookId?: string
  readonly publishedAppendCandidate?: PublishedAppendCandidate
}

export interface AuthoringSessionRepository {
  load(): AuthoringSession | undefined
  save(session: AuthoringSession): void
  clear(): void
}
