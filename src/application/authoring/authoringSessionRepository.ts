import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import type { PublicationPreparationMetadata } from '../../domain/authoring/publicationCandidate'
import type { PublishedAppendCandidate } from '../../domain/authoring/publishedAppendCandidate'
import type { ContinuityReviewBatchV1 } from '../../domain/authoring/continuityReview'
import type { StoryBibleV1 } from '../../domain/authoring/storyBible'

export interface AuthoringSession {
  readonly spec: AuthoringSpec
  readonly storyBible: StoryBibleV1
  readonly agentPrompt?: string
  readonly continuationPrompt?: string
  readonly draft?: Draft
  readonly publicationPreparation?: PublicationPreparationMetadata
  readonly targetPublishedBookId?: string
  readonly basePublishedBookFingerprint?: string
  readonly publishedAppendCandidate?: PublishedAppendCandidate
  readonly lastContinuityReviewedSequence?: number
  readonly continuityReviewBatch?: ContinuityReviewBatchV1
}

export interface AuthoringSessionRepository {
  load(): AuthoringSession | undefined
  save(session: AuthoringSession): void
  clear(): void
}
