import type { AuthoringSession } from './authoringSessionRepository'
import {
  DEFAULT_REQUESTED_CHAPTER_COUNT,
  type AuthoringSpec,
} from '../../domain/authoring/authoringContracts'
import type { PublicationPreparationMetadata } from '../../domain/authoring/publicationCandidate'
import { createEmptyStoryBible } from '../../domain/authoring/storyBible'

export const INITIAL_SPEC: AuthoringSpec = {
  premise: '',
  genre: '懸疑',
  titleHint: '',
  instructions: '',
  requestedChapterCount: DEFAULT_REQUESTED_CHAPTER_COUNT,
}
export const INITIAL_PUBLICATION_PREPARATION: PublicationPreparationMetadata = {
  publicationSlug: '',
  authorName: '',
  description: '',
  catalogSequence: undefined,
}

export function createEmptyAuthoringSession(): AuthoringSession {
  return {
    spec: { ...INITIAL_SPEC },
    storyBible: createEmptyStoryBible(),
    publicationPreparation: { ...INITIAL_PUBLICATION_PREPARATION },
  }
}
