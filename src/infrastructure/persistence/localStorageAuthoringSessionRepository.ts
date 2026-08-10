import type {
  AuthoringSpec,
  Draft,
  GeneratedDraft,
} from '../../domain/authoring/authoringContracts'
import type { PublicationPreparationMetadata } from '../../domain/authoring/publicationCandidate'
import {
  parsePublishedAppendCandidate,
  type PublishedAppendCandidate,
} from '../../domain/authoring/publishedAppendCandidate'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import type {
  AuthoringSession,
  AuthoringSessionRepository,
} from '../../application/authoring/authoringSessionRepository'

export const AUTHORING_SESSION_STORAGE_KEY =
  'innovative-novels:authoring-session:v1'

interface StoredAuthoringSession {
  readonly schemaVersion: 1
  readonly spec: AuthoringSpec
  readonly agentPrompt?: string
  readonly continuationPrompt?: string
  readonly draft?: GeneratedDraft
  readonly publicationPreparation?: PublicationPreparationMetadata
  readonly targetPublishedBookId?: string
  readonly publishedAppendCandidate?: PublishedAppendCandidate
}

const SESSION_FIELDS = new Set([
  'schemaVersion',
  'spec',
  'agentPrompt',
  'continuationPrompt',
  'draft',
  'publicationPreparation',
  'targetPublishedBookId',
  'publishedAppendCandidate',
])
const SPEC_FIELDS = new Set([
  'premise',
  'genre',
  'titleHint',
  'instructions',
  'requestedChapterCount',
])
const DRAFT_FIELDS = new Set(['title', 'categoryLabel', 'chapters'])
const CHAPTER_FIELDS = new Set(['sequence', 'title', 'prose'])
const PUBLICATION_PREPARATION_FIELDS = new Set([
  'publicationSlug',
  'authorName',
  'description',
  'catalogSequence',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((field) => allowedFields.has(field))
}

function parseSpec(value: unknown): AuthoringSpec | undefined {
  if (!isRecord(value) || !hasOnlyFields(value, SPEC_FIELDS)) {
    return undefined
  }

  if (typeof value.premise !== 'string' || typeof value.genre !== 'string') {
    return undefined
  }

  if (
    value.titleHint !== undefined &&
    typeof value.titleHint !== 'string'
  ) {
    return undefined
  }

  if (
    value.instructions !== undefined &&
    typeof value.instructions !== 'string'
  ) {
    return undefined
  }

  if (
    value.requestedChapterCount !== undefined &&
    (!Number.isInteger(value.requestedChapterCount) ||
      (value.requestedChapterCount as number) < 1 ||
      (value.requestedChapterCount as number) > 6)
  ) {
    return undefined
  }

  return {
    premise: value.premise,
    genre: value.genre,
    titleHint: value.titleHint as string | undefined,
    instructions: value.instructions as string | undefined,
    requestedChapterCount: value.requestedChapterCount as number | undefined,
  }
}

function parseGeneratedDraft(value: unknown): GeneratedDraft | undefined {
  if (!isRecord(value) || !hasOnlyFields(value, DRAFT_FIELDS)) {
    return undefined
  }

  if (
    typeof value.title !== 'string' ||
    typeof value.categoryLabel !== 'string' ||
    !Array.isArray(value.chapters)
  ) {
    return undefined
  }

  const chapters = value.chapters.map((chapter) => {
    if (
      !isRecord(chapter) ||
      !hasOnlyFields(chapter, CHAPTER_FIELDS) ||
      !Number.isInteger(chapter.sequence) ||
      typeof chapter.title !== 'string' ||
      !Array.isArray(chapter.prose) ||
      !chapter.prose.every((paragraph) => typeof paragraph === 'string')
    ) {
      return undefined
    }

    return {
      sequence: chapter.sequence as number,
      title: chapter.title,
      prose: chapter.prose as string[],
    }
  })

  if (chapters.some((chapter) => chapter === undefined)) {
    return undefined
  }

  return {
    title: value.title,
    categoryLabel: value.categoryLabel,
    chapters: chapters as GeneratedDraft['chapters'],
  }
}

function parsePublicationPreparation(
  value: unknown,
): PublicationPreparationMetadata | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, PUBLICATION_PREPARATION_FIELDS) ||
    typeof value.publicationSlug !== 'string' ||
    typeof value.authorName !== 'string' ||
    typeof value.description !== 'string'
  ) {
    return undefined
  }

  if (
    value.catalogSequence !== undefined &&
    (!Number.isInteger(value.catalogSequence) ||
      (value.catalogSequence as number) < 1)
  ) {
    return undefined
  }

  return {
    publicationSlug: value.publicationSlug,
    authorName: value.authorName,
    description: value.description,
    catalogSequence: value.catalogSequence as number | undefined,
  }
}

function parseStoredSession(serialized: string | null): AuthoringSession | undefined {
  if (!serialized) {
    return undefined
  }

  try {
    const candidate: unknown = JSON.parse(serialized)
    if (
      !isRecord(candidate) ||
      !hasOnlyFields(candidate, SESSION_FIELDS) ||
      candidate.schemaVersion !== 1
    ) {
      return undefined
    }

    const spec = parseSpec(candidate.spec)
    if (!spec) {
      return undefined
    }

    if (
      candidate.agentPrompt !== undefined &&
      typeof candidate.agentPrompt !== 'string'
    ) {
      return undefined
    }

    if (
      candidate.continuationPrompt !== undefined &&
      typeof candidate.continuationPrompt !== 'string'
    ) {
      return undefined
    }

    const generatedDraft =
      candidate.draft === undefined
        ? undefined
        : parseGeneratedDraft(candidate.draft)
    if (candidate.draft !== undefined && !generatedDraft) {
      return undefined
    }

    const publicationPreparation =
      candidate.publicationPreparation === undefined
        ? undefined
        : parsePublicationPreparation(candidate.publicationPreparation)
    if (
      candidate.publicationPreparation !== undefined &&
      !publicationPreparation
    ) {
      return undefined
    }

    const targetPublishedBookId =
      candidate.targetPublishedBookId === undefined
        ? undefined
        : typeof candidate.targetPublishedBookId === 'string'
          ? candidate.targetPublishedBookId
          : undefined
    if (
      candidate.targetPublishedBookId !== undefined &&
      targetPublishedBookId === undefined
    ) {
      return undefined
    }

    const publishedAppendCandidate =
      candidate.publishedAppendCandidate === undefined
        ? undefined
        : parsePublishedAppendCandidate(candidate.publishedAppendCandidate)
    if (
      candidate.publishedAppendCandidate !== undefined &&
      !publishedAppendCandidate
    ) {
      return undefined
    }

    let draft: Draft | undefined
    if (generatedDraft) {
      draft = {
        ...generatedDraft,
        status: 'DRAFT',
        quality: evaluateDraftQuality(generatedDraft),
      }
    }

    return {
      spec,
      agentPrompt: candidate.agentPrompt as string | undefined,
      continuationPrompt: candidate.continuationPrompt as string | undefined,
      draft,
      publicationPreparation,
      targetPublishedBookId,
      publishedAppendCandidate,
    }
  } catch {
    return undefined
  }
}

export class LocalStorageAuthoringSessionRepository
  implements AuthoringSessionRepository
{
  private readonly storage: Storage

  constructor(storage: Storage) {
    this.storage = storage
  }

  load(): AuthoringSession | undefined {
    try {
      const raw = this.storage.getItem(AUTHORING_SESSION_STORAGE_KEY)
      const session = parseStoredSession(raw)
      if (!session && raw !== null) {
        this.clear()
      }
      return session
    } catch {
      return undefined
    }
  }

  save(session: AuthoringSession): void {
    try {
      const stored: StoredAuthoringSession = {
        schemaVersion: 1,
        spec: session.spec,
        agentPrompt: session.agentPrompt,
        continuationPrompt: session.continuationPrompt,
        draft: session.draft
          ? {
              title: session.draft.title,
              categoryLabel: session.draft.categoryLabel,
              chapters: session.draft.chapters,
            }
        : undefined,
        publicationPreparation: session.publicationPreparation,
        targetPublishedBookId: session.targetPublishedBookId,
        publishedAppendCandidate: session.publishedAppendCandidate,
      }
      this.storage.setItem(
        AUTHORING_SESSION_STORAGE_KEY,
        JSON.stringify(stored),
      )
    } catch {
      // Persistence failures leave authoring usable without session recovery.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(AUTHORING_SESSION_STORAGE_KEY)
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
  }
}
