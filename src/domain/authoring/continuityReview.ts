import type { Draft, DraftChapter } from './authoringContracts'
import {
  STORY_BIBLE_LIMITS,
  validateStoryBible,
  type StoryBibleV1,
} from './storyBible'

export const MIN_CONTINUITY_REVIEW_BATCH_SIZE = 1
export const MAX_CONTINUITY_REVIEW_BATCH_SIZE = 5
export const DEFAULT_CONTINUITY_REVIEW_BATCH_SIZE = 2

export const CONTINUITY_REVIEW_PROPOSAL_TYPES = [
  'ADD_CHARACTER',
  'UPDATE_CHARACTER',
  'ADD_WORLD_RULE',
  'ADD_OPEN_THREAD',
  'RESOLVE_OPEN_THREAD',
  'ADD_STYLE_NOTE',
] as const

export type ContinuityReviewProposalType =
  (typeof CONTINUITY_REVIEW_PROPOSAL_TYPES)[number]

export interface AddCharacterProposal {
  readonly type: 'ADD_CHARACTER'
  readonly name: string
  readonly notes: string
  readonly reason: string
}

export interface UpdateCharacterProposal {
  readonly type: 'UPDATE_CHARACTER'
  readonly name: string
  readonly notes: string
  readonly reason: string
}

export interface AddWorldRuleProposal {
  readonly type: 'ADD_WORLD_RULE'
  readonly text: string
  readonly reason: string
}

export interface AddOpenThreadProposal {
  readonly type: 'ADD_OPEN_THREAD'
  readonly text: string
  readonly reason: string
}

export interface ResolveOpenThreadProposal {
  readonly type: 'RESOLVE_OPEN_THREAD'
  readonly text: string
  readonly reason: string
}

export interface AddStyleNoteProposal {
  readonly type: 'ADD_STYLE_NOTE'
  readonly text: string
  readonly reason: string
}

export type ContinuityReviewProposal =
  | AddCharacterProposal
  | UpdateCharacterProposal
  | AddWorldRuleProposal
  | AddOpenThreadProposal
  | ResolveOpenThreadProposal
  | AddStyleNoteProposal

export type ContinuityReviewProposalDecision = 'PENDING' | 'ACCEPT' | 'REJECT'
export type ContinuityReviewProposalValidity = 'VALID' | 'CONFLICT'

export interface ContinuityReviewProposalRecord {
  readonly proposal: ContinuityReviewProposal
  readonly validity: ContinuityReviewProposalValidity
  readonly conflictReason?: string
  readonly decision: ContinuityReviewProposalDecision
  readonly applied: boolean
}

export type ContinuityReviewBatchStatus =
  | 'DRAFT'
  | 'PROPOSALS_IMPORTED'
  | 'READY_TO_APPLY'
  | 'APPLIED'
  | 'COMPLETED'
  | 'STALE'

export interface ContinuityReviewBatchV1 {
  readonly schemaVersion: 1
  readonly projectId?: string
  readonly reviewedFromSequence: number
  readonly reviewedToSequence: number
  readonly sourceDraftFingerprint: string
  readonly sourceBibleFingerprint: string
  readonly generatedPrompt: string
  readonly proposals: readonly ContinuityReviewProposalRecord[]
  readonly status: ContinuityReviewBatchStatus
  readonly appliedStoryBibleFingerprint?: string
}

export interface ContinuityReviewParseError {
  readonly code:
    | 'INVALID_JSON'
    | 'ROOT_NOT_OBJECT'
    | 'ROOT_FIELDS_INVALID'
    | 'PROPOSALS_NOT_ARRAY'
    | 'PROPOSAL_NOT_OBJECT'
    | 'UNKNOWN_PROPOSAL_TYPE'
    | 'PROPOSAL_FIELDS_INVALID'
    | 'REQUIRED_FIELD_INVALID'
  readonly message: string
  readonly path?: string
}

export type ContinuityReviewParseResult =
  | {
      readonly ok: true
      readonly proposals: readonly ContinuityReviewProposal[]
    }
  | {
      readonly ok: false
      readonly errors: readonly ContinuityReviewParseError[]
    }

export interface ContinuityReviewProposalClassification {
  readonly validity: ContinuityReviewProposalValidity
  readonly conflictReason?: string
}

export interface ContinuityReviewRange {
  readonly reviewedFromSequence: number
  readonly reviewedToSequence: number
}

export interface ContinuityReviewStatusSummary {
  readonly reviewedThroughSequence: number
  readonly unreviewedChapterSequences: readonly number[]
  readonly nextEligibleRange?: ContinuityReviewRange
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === fields.length && keys.every((field) => fields.includes(field))
}

function requiredText(
  value: Record<string, unknown>,
  field: string,
  path: string,
): { readonly value: string } | { readonly error: ContinuityReviewParseError } {
  const candidate = value[field]
  if (
    typeof candidate !== 'string' ||
    candidate.trim().length === 0 ||
    candidate !== candidate.trim()
  ) {
    return {
      error: {
        code: 'REQUIRED_FIELD_INVALID',
        message: `${field} must be a non-empty trimmed string.`,
        path: `${path}.${field}`,
      },
    }
  }
  return { value: candidate }
}

function parseProposal(
  value: unknown,
  index: number,
):
  | { readonly ok: true; readonly proposal: ContinuityReviewProposal }
  | { readonly ok: false; readonly error: ContinuityReviewParseError } {
  const path = `proposals[${index}]`
  if (!isRecord(value)) {
    return {
      ok: false,
      error: {
        code: 'PROPOSAL_NOT_OBJECT',
        message: 'Each proposal must be an object.',
        path,
      },
    }
  }

  if (typeof value.type !== 'string') {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_PROPOSAL_TYPE',
        message: 'Each proposal must have a recognized type.',
        path: `${path}.type`,
      },
    }
  }

  const type = value.type
  const fields =
    type === 'ADD_CHARACTER' || type === 'UPDATE_CHARACTER'
      ? ['type', 'name', 'notes', 'reason']
      : type === 'ADD_WORLD_RULE' ||
          type === 'ADD_OPEN_THREAD' ||
          type === 'RESOLVE_OPEN_THREAD' ||
          type === 'ADD_STYLE_NOTE'
        ? ['type', 'text', 'reason']
        : undefined

  if (!fields) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_PROPOSAL_TYPE',
        message: `Unknown proposal type: ${type}.`,
        path: `${path}.type`,
      },
    }
  }

  if (!hasExactFields(value, fields)) {
    return {
      ok: false,
      error: {
        code: 'PROPOSAL_FIELDS_INVALID',
        message: `${type} contains unexpected or missing fields.`,
        path,
      },
    }
  }

  const reason = requiredText(value, 'reason', path)
  if ('error' in reason) {
    return { ok: false, error: reason.error }
  }

  if (type === 'ADD_CHARACTER' || type === 'UPDATE_CHARACTER') {
    const name = requiredText(value, 'name', path)
    const notes = requiredText(value, 'notes', path)
    if ('error' in name) {
      return { ok: false, error: name.error }
    }
    if ('error' in notes) {
      return { ok: false, error: notes.error }
    }
    return {
      ok: true,
      proposal: { type, name: name.value, notes: notes.value, reason: reason.value },
    }
  }

  const text = requiredText(value, 'text', path)
  if ('error' in text) {
    return { ok: false, error: text.error }
  }
  return {
    ok: true,
    proposal: { type, text: text.value, reason: reason.value },
  } as { readonly ok: true; readonly proposal: ContinuityReviewProposal }
}

export function parseContinuityReviewProposals(
  raw: string,
): ContinuityReviewParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return {
      ok: false,
      errors: [{ code: 'INVALID_JSON', message: 'Response must be raw JSON only.' }],
    }
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: [{ code: 'ROOT_NOT_OBJECT', message: 'Root JSON value must be an object.' }],
    }
  }
  if (!hasExactFields(parsed, ['proposals'])) {
    return {
      ok: false,
      errors: [
        {
          code: 'ROOT_FIELDS_INVALID',
          message: 'Root object must contain exactly the proposals field.',
        },
      ],
    }
  }
  if (!Array.isArray(parsed.proposals)) {
    return {
      ok: false,
      errors: [{ code: 'PROPOSALS_NOT_ARRAY', message: 'proposals must be an array.' }],
    }
  }

  const errors: ContinuityReviewParseError[] = []
  const proposals: ContinuityReviewProposal[] = []
  parsed.proposals.forEach((value, index) => {
    const result = parseProposal(value, index)
    if (result.ok) {
      proposals.push(result.proposal)
    } else {
      errors.push(result.error)
    }
  })

  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposals }
}

function normalizeComparable(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ')
}

function classifyOne(
  proposal: ContinuityReviewProposal,
  state: {
    readonly characterNames: Set<string>
    readonly worldRules: Set<string>
    readonly openThreads: Set<string>
    readonly styleNotes: Set<string>
  },
): ContinuityReviewProposalClassification {
  if (proposal.type === 'ADD_CHARACTER') {
    const name = normalizeComparable(proposal.name)
    if (state.characterNames.has(name)) {
      return { validity: 'CONFLICT', conflictReason: 'Character already exists.' }
    }
    if (state.characterNames.size >= STORY_BIBLE_LIMITS.characters) {
      return { validity: 'CONFLICT', conflictReason: 'Character limit would be exceeded.' }
    }
    state.characterNames.add(name)
    return { validity: 'VALID' }
  }

  if (proposal.type === 'UPDATE_CHARACTER') {
    return state.characterNames.has(normalizeComparable(proposal.name))
      ? { validity: 'VALID' }
      : { validity: 'CONFLICT', conflictReason: 'Target character does not exist.' }
  }

  if (proposal.type === 'ADD_WORLD_RULE') {
    const text = normalizeComparable(proposal.text)
    if (state.worldRules.has(text)) {
      return { validity: 'CONFLICT', conflictReason: 'Equivalent world rule already exists.' }
    }
    if (state.worldRules.size >= STORY_BIBLE_LIMITS.worldRules) {
      return { validity: 'CONFLICT', conflictReason: 'World rule limit would be exceeded.' }
    }
    state.worldRules.add(text)
    return { validity: 'VALID' }
  }

  if (proposal.type === 'ADD_OPEN_THREAD') {
    const text = normalizeComparable(proposal.text)
    if (state.openThreads.has(text)) {
      return { validity: 'CONFLICT', conflictReason: 'Equivalent open thread already exists.' }
    }
    if (state.openThreads.size >= STORY_BIBLE_LIMITS.openThreads) {
      return { validity: 'CONFLICT', conflictReason: 'Open thread limit would be exceeded.' }
    }
    state.openThreads.add(text)
    return { validity: 'VALID' }
  }

  if (proposal.type === 'RESOLVE_OPEN_THREAD') {
    const text = normalizeComparable(proposal.text)
    if (!state.openThreads.has(text)) {
      return { validity: 'CONFLICT', conflictReason: 'Exact open thread does not exist.' }
    }
    state.openThreads.delete(text)
    return { validity: 'VALID' }
  }

  const text = normalizeComparable(proposal.text)
  if (state.styleNotes.has(text)) {
    return { validity: 'CONFLICT', conflictReason: 'Equivalent style note already exists.' }
  }
  if (state.styleNotes.size >= STORY_BIBLE_LIMITS.styleNotes) {
    return { validity: 'CONFLICT', conflictReason: 'Style note limit would be exceeded.' }
  }
  state.styleNotes.add(text)
  return { validity: 'VALID' }
}

function createClassificationState(storyBible: StoryBibleV1) {
  return {
    characterNames: new Set(storyBible.characters.map((character) => normalizeComparable(character.name))),
    worldRules: new Set(storyBible.worldRules.map(normalizeComparable)),
    openThreads: new Set(storyBible.openThreads.map(normalizeComparable)),
    styleNotes: new Set(storyBible.styleNotes.map(normalizeComparable)),
  }
}

export function classifyContinuityProposals(
  storyBible: StoryBibleV1,
  proposals: readonly ContinuityReviewProposal[],
): readonly ContinuityReviewProposalClassification[] {
  const state = createClassificationState(storyBible)
  return proposals.map((proposal) => classifyOne(proposal, state))
}

export function createContinuityReviewProposalRecords(
  storyBible: StoryBibleV1,
  proposals: readonly ContinuityReviewProposal[],
): readonly ContinuityReviewProposalRecord[] {
  return proposals.map((proposal, index) => {
    const classification = classifyContinuityProposals(storyBible, proposals.slice(0, index + 1))[index]
    return {
      proposal,
      validity: classification?.validity ?? 'CONFLICT',
      conflictReason: classification?.conflictReason,
      decision: 'PENDING',
      applied: false,
    }
  })
}

function serializeDraftChapter(chapter: DraftChapter) {
  return {
    sequence: chapter.sequence,
    title: chapter.title,
    prose: [...chapter.prose],
  }
}

function draftRange(
  draft: Draft,
  reviewedFromSequence: number,
  reviewedToSequence: number,
): readonly DraftChapter[] | undefined {
  if (
    !Number.isInteger(reviewedFromSequence) ||
    !Number.isInteger(reviewedToSequence) ||
    reviewedFromSequence < 1 ||
    reviewedToSequence < reviewedFromSequence
  ) {
    return undefined
  }

  const selected = draft.chapters.filter(
    (chapter) =>
      chapter.sequence >= reviewedFromSequence &&
      chapter.sequence <= reviewedToSequence,
  )
  if (
    selected.length !== reviewedToSequence - reviewedFromSequence + 1 ||
    selected.some(
      (chapter, index) =>
        chapter.sequence !== reviewedFromSequence + index,
    )
  ) {
    return undefined
  }
  return selected
}

function serializeDraftRange(
  draft: Draft,
  reviewedFromSequence: number,
  reviewedToSequence: number,
): string | undefined {
  const selected = draftRange(draft, reviewedFromSequence, reviewedToSequence)
  return selected
    ? JSON.stringify(selected.map(serializeDraftChapter))
    : undefined
}

function serializeStoryBible(storyBible: StoryBibleV1): string {
  return JSON.stringify({
    characters: storyBible.characters.map((character) => ({
      name: character.name,
      notes: character.notes,
    })),
    worldRules: [...storyBible.worldRules],
    openThreads: [...storyBible.openThreads],
    styleNotes: [...storyBible.styleNotes],
  })
}

async function sha256(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('Web Crypto SHA-256 is unavailable.')
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function fingerprintContinuityDraftRange(
  draft: Draft,
  reviewedFromSequence: number,
  reviewedToSequence: number,
): Promise<string> {
  const serialized = serializeDraftRange(draft, reviewedFromSequence, reviewedToSequence)
  if (serialized === undefined) {
    throw new Error('The requested Draft review range is not contiguous and available.')
  }
  return sha256(serialized)
}

export async function fingerprintStoryBible(storyBible: StoryBibleV1): Promise<string> {
  return sha256(serializeStoryBible(storyBible))
}

export function buildContinuityReviewPrompt(
  draft: Draft,
  specGenre: string,
  storyBible: StoryBibleV1,
  reviewedFromSequence: number,
  reviewedToSequence: number,
): { readonly ok: true; readonly prompt: string } | { readonly ok: false; readonly message: string } {
  const selected = draftRange(draft, reviewedFromSequence, reviewedToSequence)
  if (!selected) {
    return { ok: false, message: 'The selected Draft review range is unavailable or not contiguous.' }
  }

  const selectedChapterPayload = selected.map((chapter) => ({
    sequence: chapter.sequence,
    title: chapter.title,
    prose: chapter.prose.join('\n\n'),
  }))
  const prompt = [
    'Role: Novel Story Bible Continuity Review Agent',
    '',
    'Continuity review task: identify only durable Story Bible changes supported by the exact reviewed Draft chapters below.',
    `Story title: ${draft.title.trim()}`,
    `Genre: ${specGenre.trim()}`,
    '',
    'Current Story Bible:',
    JSON.stringify(storyBible, null, 2),
    '',
    'Chapter-title orientation (titles only; no historical prose is included here):',
    JSON.stringify(draft.chapters.map((chapter) => ({ sequence: chapter.sequence, title: chapter.title })), null, 2),
    '',
    `Exact review range: chapters ${reviewedFromSequence} through ${reviewedToSequence}.`,
    'Exact reviewed Draft chapters:',
    JSON.stringify(selectedChapterPayload, null, 2),
    '',
    'Allowed proposal operations exactly:',
    '- ADD_CHARACTER: name, notes, reason',
    '- UPDATE_CHARACTER: exact existing name, complete replacement notes, reason',
    '- ADD_WORLD_RULE: text, reason',
    '- ADD_OPEN_THREAD: text, reason',
    '- RESOLVE_OPEN_THREAD: exact existing open-thread text, reason',
    '- ADD_STYLE_NOTE: text, reason',
    '',
    'Required raw JSON-only response contract:',
    '{',
    '  "proposals": [',
    '    { "type": "ADD_WORLD_RULE", "text": "...", "reason": "..." }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Return one JSON object only: no Markdown fence, preface, explanation, or trailing text.',
    '- Propose only newly established or clarified character canon, world rules, open-thread additions or explicit resolutions, or durable story-specific style notes clearly supported by the reviewed chapters.',
    '- Do not generate future plot, rewrite prose, judge literary quality, summarize the whole story, replace the Story Bible, or remove existing canon.',
    '- Do not include Draft chapters, BookId, ChapterId, publicationSlug, access, published state, projectId, targetPublishedBookId, fingerprints, checkpoint, quality state, or a complete Story Bible replacement.',
    '- reason is for human review only and is never Story Bible content.',
    '',
    'Final self-check:',
    '- Confirm the root has exactly one field: proposals.',
    '- Confirm every proposal has exactly the fields allowed by its operation.',
    '- Confirm every required value is a non-empty trimmed string.',
    '- Return {}? No: return {"proposals":[]} when there are no durable updates.',
  ].join('\n')

  return { ok: true, prompt }
}

export function getContinuityReviewStatus(
  draft: Draft | undefined,
  lastContinuityReviewedSequence: number,
  batchSize = DEFAULT_CONTINUITY_REVIEW_BATCH_SIZE,
): ContinuityReviewStatusSummary {
  const chapters = draft?.chapters ?? []
  const unreviewedChapterSequences = chapters
    .filter((chapter) => chapter.sequence > lastContinuityReviewedSequence)
    .map((chapter) => chapter.sequence)
  const first = unreviewedChapterSequences[0]
  const contiguousCount =
    first === undefined
      ? 0
      : unreviewedChapterSequences.findIndex(
          (sequence, index) => sequence !== first + index,
        )
  const eligibleCount =
    first === undefined
      ? 0
      : (contiguousCount < 0 ? unreviewedChapterSequences.length : contiguousCount)
  const eligible =
    first === undefined
      ? undefined
      : {
          reviewedFromSequence: first,
          reviewedToSequence: first + Math.min(batchSize, MAX_CONTINUITY_REVIEW_BATCH_SIZE, eligibleCount) - 1,
        }
  return {
    reviewedThroughSequence: lastContinuityReviewedSequence,
    unreviewedChapterSequences,
    nextEligibleRange: eligible,
  }
}

export function advanceContinuityCheckpointAfterDraftEdit(
  previousDraft: Draft,
  nextDraft: Draft,
  checkpoint: number,
): number {
  if (checkpoint <= 0) {
    return 0
  }
  const previousBySequence = new Map(
    previousDraft.chapters.map((chapter) => [chapter.sequence, serializeDraftChapter(chapter)]),
  )
  const nextBySequence = new Map(
    nextDraft.chapters.map((chapter) => [chapter.sequence, serializeDraftChapter(chapter)]),
  )
  const reviewedSequences = new Set<number>()
  previousBySequence.forEach((_, sequence) => {
    if (sequence <= checkpoint) reviewedSequences.add(sequence)
  })
  nextBySequence.forEach((_, sequence) => {
    if (sequence <= checkpoint) reviewedSequences.add(sequence)
  })
  const earliestChanged = [...reviewedSequences]
    .sort((left, right) => left - right)
    .find((sequence) => JSON.stringify(previousBySequence.get(sequence)) !== JSON.stringify(nextBySequence.get(sequence)))
  return earliestChanged === undefined ? checkpoint : Math.max(0, earliestChanged - 1)
}

export function isContinuityReviewDraftRangeCurrent(
  batch: ContinuityReviewBatchV1,
  draft: Draft,
): boolean {
  return serializeDraftRange(draft, batch.reviewedFromSequence, batch.reviewedToSequence) !== undefined
}

export function isContinuityReviewDraftRangeChanged(
  batch: ContinuityReviewBatchV1,
  previousDraft: Draft,
  nextDraft: Draft,
): boolean {
  const previous = serializeDraftRange(previousDraft, batch.reviewedFromSequence, batch.reviewedToSequence)
  const next = serializeDraftRange(nextDraft, batch.reviewedFromSequence, batch.reviewedToSequence)
  return previous !== next
}

export async function isContinuityReviewBatchStale(
  batch: ContinuityReviewBatchV1,
  draft: Draft,
  storyBible: StoryBibleV1,
  activeProjectId?: string,
): Promise<boolean> {
  if (batch.status === 'STALE') return true
  if (batch.projectId !== undefined && batch.projectId !== activeProjectId) return true
  if (!isContinuityReviewDraftRangeCurrent(batch, draft)) return true
  try {
    const draftFingerprint = await fingerprintContinuityDraftRange(
      draft,
      batch.reviewedFromSequence,
      batch.reviewedToSequence,
    )
    if (draftFingerprint !== batch.sourceDraftFingerprint) return true
    const bibleFingerprint = await fingerprintStoryBible(storyBible)
    return batch.status === 'APPLIED'
      ? bibleFingerprint !== batch.appliedStoryBibleFingerprint
      : bibleFingerprint !== batch.sourceBibleFingerprint
  } catch {
    return true
  }
}

export async function createContinuityReviewBatch({
  draft,
  specGenre,
  storyBible,
  reviewedFromSequence,
  reviewedToSequence,
  projectId,
}: {
  readonly draft: Draft
  readonly specGenre: string
  readonly storyBible: StoryBibleV1
  readonly reviewedFromSequence: number
  readonly reviewedToSequence: number
  readonly projectId?: string
}): Promise<
  | { readonly ok: true; readonly batch: ContinuityReviewBatchV1 }
  | { readonly ok: false; readonly message: string }
> {
  const count = reviewedToSequence - reviewedFromSequence + 1
  if (
    !Number.isInteger(count) ||
    count < MIN_CONTINUITY_REVIEW_BATCH_SIZE ||
    count > MAX_CONTINUITY_REVIEW_BATCH_SIZE
  ) {
    return { ok: false, message: 'A continuity review batch must contain 1 to 5 contiguous chapters.' }
  }
  const prompt = buildContinuityReviewPrompt(
    draft,
    specGenre,
    storyBible,
    reviewedFromSequence,
    reviewedToSequence,
  )
  if (!prompt.ok) return prompt
  try {
    const [sourceDraftFingerprint, sourceBibleFingerprint] = await Promise.all([
      fingerprintContinuityDraftRange(draft, reviewedFromSequence, reviewedToSequence),
      fingerprintStoryBible(storyBible),
    ])
    return {
      ok: true,
      batch: {
        schemaVersion: 1,
        projectId,
        reviewedFromSequence,
        reviewedToSequence,
        sourceDraftFingerprint,
        sourceBibleFingerprint,
        generatedPrompt: prompt.prompt,
        proposals: [],
        status: 'DRAFT',
      },
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Unable to fingerprint continuity review inputs.',
    }
  }
}

export function importContinuityReviewProposals(
  batch: ContinuityReviewBatchV1,
  storyBible: StoryBibleV1,
  raw: string,
):
  | { readonly ok: true; readonly batch: ContinuityReviewBatchV1 }
  | { readonly ok: false; readonly errors: readonly ContinuityReviewParseError[] } {
  const parsed = parseContinuityReviewProposals(raw)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    batch: {
      ...batch,
      proposals: createContinuityReviewProposalRecords(storyBible, parsed.proposals),
      status: 'PROPOSALS_IMPORTED',
    },
  }
}

export function decideContinuityReviewProposal(
  batch: ContinuityReviewBatchV1,
  index: number,
  decision: Exclude<ContinuityReviewProposalDecision, 'PENDING'>,
):
  | { readonly ok: true; readonly batch: ContinuityReviewBatchV1 }
  | { readonly ok: false; readonly message: string } {
  const current = batch.proposals[index]
  if (!current) return { ok: false, message: 'Proposal not found.' }
  if (decision === 'ACCEPT' && current.validity === 'CONFLICT') {
    return { ok: false, message: current.conflictReason ?? 'Conflicting proposals cannot be accepted.' }
  }
  const proposals = batch.proposals.map((proposal, proposalIndex) =>
    proposalIndex === index ? { ...proposal, decision } : proposal,
  )
  const ready = proposals.every((proposal) => proposal.decision !== 'PENDING')
  return {
    ok: true,
    batch: {
      ...batch,
      proposals,
      status: ready ? 'READY_TO_APPLY' : 'PROPOSALS_IMPORTED',
    },
  }
}

function applyProposal(
  storyBible: StoryBibleV1,
  proposal: ContinuityReviewProposal,
): StoryBibleV1 {
  if (proposal.type === 'ADD_CHARACTER') {
    return {
      ...storyBible,
      characters: [...storyBible.characters, { name: proposal.name, notes: proposal.notes }],
    }
  }
  if (proposal.type === 'UPDATE_CHARACTER') {
    return {
      ...storyBible,
      characters: storyBible.characters.map((character) =>
        normalizeComparable(character.name) === normalizeComparable(proposal.name)
          ? { ...character, notes: proposal.notes }
          : character,
      ),
    }
  }
  if (proposal.type === 'ADD_WORLD_RULE') {
    return { ...storyBible, worldRules: [...storyBible.worldRules, proposal.text] }
  }
  if (proposal.type === 'ADD_OPEN_THREAD') {
    return { ...storyBible, openThreads: [...storyBible.openThreads, proposal.text] }
  }
  if (proposal.type === 'RESOLVE_OPEN_THREAD') {
    return {
      ...storyBible,
      openThreads: storyBible.openThreads.filter(
        (thread) => normalizeComparable(thread) !== normalizeComparable(proposal.text),
      ),
    }
  }
  return { ...storyBible, styleNotes: [...storyBible.styleNotes, proposal.text] }
}

export async function applyAcceptedContinuityReview({
  batch,
  draft,
  storyBible,
  activeProjectId,
}: {
  readonly batch: ContinuityReviewBatchV1
  readonly draft: Draft
  readonly storyBible: StoryBibleV1
  readonly activeProjectId?: string
}): Promise<
  | { readonly ok: true; readonly storyBible: StoryBibleV1; readonly batch: ContinuityReviewBatchV1 }
  | { readonly ok: false; readonly message: string }
> {
  if (batch.status === 'STALE') return { ok: false, message: 'This continuity review batch is STALE. Regenerate it.' }
  if (batch.status === 'APPLIED') return { ok: false, message: 'Accepted proposals have already been applied.' }
  if (batch.status !== 'PROPOSALS_IMPORTED' && batch.status !== 'READY_TO_APPLY') {
    return { ok: false, message: 'Parse proposals before applying this review batch.' }
  }
  if (batch.projectId !== undefined && batch.projectId !== activeProjectId) {
    return { ok: false, message: 'This review batch belongs to another active project.' }
  }
  if (batch.proposals.some((proposal) => proposal.decision === 'PENDING')) {
    return { ok: false, message: 'Every imported proposal must be explicitly accepted or rejected before applying.' }
  }
  try {
    const [draftFingerprint, bibleFingerprint] = await Promise.all([
      fingerprintContinuityDraftRange(draft, batch.reviewedFromSequence, batch.reviewedToSequence),
      fingerprintStoryBible(storyBible),
    ])
    if (draftFingerprint !== batch.sourceDraftFingerprint || bibleFingerprint !== batch.sourceBibleFingerprint) {
      return { ok: false, message: 'This continuity review batch is STALE. Regenerate it.' }
    }
    const accepted = batch.proposals
      .filter((record) => record.decision === 'ACCEPT')
      .map((record) => record.proposal)
    const classifications = classifyContinuityProposals(storyBible, accepted)
    const conflict = classifications.find((classification) => classification.validity === 'CONFLICT')
    if (conflict) {
      return { ok: false, message: conflict.conflictReason ?? 'An accepted proposal is no longer valid.' }
    }
    let nextStoryBible = storyBible
    for (const proposal of accepted) {
      nextStoryBible = applyProposal(nextStoryBible, proposal)
    }
    if (validateStoryBible(nextStoryBible).length > 0) {
      return { ok: false, message: 'Accepted proposals exceed Story Bible bounds or validation rules.' }
    }
    const appliedStoryBibleFingerprint = await fingerprintStoryBible(nextStoryBible)
    return {
      ok: true,
      storyBible: nextStoryBible,
      batch: {
        ...batch,
        proposals: batch.proposals.map((record) => ({
          ...record,
          applied: record.decision === 'ACCEPT',
        })),
        status: 'APPLIED',
        appliedStoryBibleFingerprint,
      },
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Continuity review could not be applied safely.',
    }
  }
}

export async function completeContinuityReview({
  batch,
  draft,
  storyBible,
  activeProjectId,
  currentCheckpoint,
}: {
  readonly batch: ContinuityReviewBatchV1
  readonly draft: Draft
  readonly storyBible: StoryBibleV1
  readonly activeProjectId?: string
  readonly currentCheckpoint: number
}): Promise<
  | { readonly ok: true; readonly checkpoint: number; readonly batch: ContinuityReviewBatchV1 }
  | { readonly ok: false; readonly message: string }
> {
  if (batch.status === 'STALE') return { ok: false, message: 'This continuity review batch is STALE. Regenerate it.' }
  if (batch.status === 'DRAFT') return { ok: false, message: 'Parse proposals or import an explicit zero-proposal response before completing review.' }
  if (batch.projectId !== undefined && batch.projectId !== activeProjectId) {
    return { ok: false, message: 'This review batch belongs to another active project.' }
  }
  if (batch.reviewedFromSequence !== currentCheckpoint + 1) {
    return { ok: false, message: 'The review checkpoint changed. Regenerate this batch.' }
  }
  if (batch.proposals.some((proposal) => proposal.decision === 'PENDING')) {
    return { ok: false, message: 'Every imported proposal must be explicitly accepted or rejected before completing review.' }
  }
  if (batch.proposals.some((proposal) => proposal.decision === 'ACCEPT' && !proposal.applied)) {
    return { ok: false, message: 'All accepted proposals must be applied before completing review.' }
  }
  try {
    const draftFingerprint = await fingerprintContinuityDraftRange(
      draft,
      batch.reviewedFromSequence,
      batch.reviewedToSequence,
    )
    if (draftFingerprint !== batch.sourceDraftFingerprint) {
      return { ok: false, message: 'This continuity review batch is STALE. Regenerate it.' }
    }
    const bibleFingerprint = await fingerprintStoryBible(storyBible)
    const expectedBibleFingerprint =
      batch.status === 'APPLIED' ? batch.appliedStoryBibleFingerprint : batch.sourceBibleFingerprint
    if (bibleFingerprint !== expectedBibleFingerprint) {
      return { ok: false, message: 'This continuity review batch is STALE. Regenerate it.' }
    }
    return {
      ok: true,
      checkpoint: batch.reviewedToSequence,
      batch: { ...batch, status: 'COMPLETED' },
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Continuity review could not be completed safely.',
    }
  }
}

export function parseContinuityReviewBatch(value: unknown): ContinuityReviewBatchV1 | undefined {
  if (!isRecord(value)) return undefined
  const allowed = [
    'schemaVersion',
    'projectId',
    'reviewedFromSequence',
    'reviewedToSequence',
    'sourceDraftFingerprint',
    'sourceBibleFingerprint',
    'generatedPrompt',
    'proposals',
    'status',
    'appliedStoryBibleFingerprint',
  ]
  if (!Object.keys(value).every((field) => allowed.includes(field))) return undefined
  if (
    value.schemaVersion !== 1 ||
    !Number.isInteger(value.reviewedFromSequence) ||
    !Number.isInteger(value.reviewedToSequence) ||
    (value.reviewedFromSequence as number) < 1 ||
    (value.reviewedToSequence as number) < (value.reviewedFromSequence as number) ||
    typeof value.sourceDraftFingerprint !== 'string' ||
    value.sourceDraftFingerprint.trim().length === 0 ||
    typeof value.sourceBibleFingerprint !== 'string' ||
    value.sourceBibleFingerprint.trim().length === 0 ||
    typeof value.generatedPrompt !== 'string' ||
    value.generatedPrompt.trim().length === 0 ||
    !Array.isArray(value.proposals) ||
    !['DRAFT', 'PROPOSALS_IMPORTED', 'READY_TO_APPLY', 'APPLIED', 'COMPLETED', 'STALE'].includes(value.status as string)
  ) {
    return undefined
  }
  if (value.projectId !== undefined && (typeof value.projectId !== 'string' || value.projectId.trim().length === 0)) return undefined
  if (value.appliedStoryBibleFingerprint !== undefined && (typeof value.appliedStoryBibleFingerprint !== 'string' || value.appliedStoryBibleFingerprint.trim().length === 0)) return undefined

  const proposalRecords = value.proposals.map((record) => {
    if (
      !isRecord(record) ||
      !Object.keys(record).every((field) =>
        ['proposal', 'validity', 'conflictReason', 'decision', 'applied'].includes(field),
      ) ||
      !('proposal' in record) ||
      !('validity' in record) ||
      !('decision' in record) ||
      !('applied' in record)
    ) return undefined
    const parsedProposal = parseProposal(record.proposal, 0)
    if (!parsedProposal.ok || !['VALID', 'CONFLICT'].includes(record.validity as string) || !['PENDING', 'ACCEPT', 'REJECT'].includes(record.decision as string) || typeof record.applied !== 'boolean' || (record.conflictReason !== undefined && typeof record.conflictReason !== 'string')) return undefined
    return {
      proposal: parsedProposal.proposal,
      validity: record.validity as ContinuityReviewProposalValidity,
      conflictReason: record.conflictReason as string | undefined,
      decision: record.decision as ContinuityReviewProposalDecision,
      applied: record.applied,
    }
  })
  if (proposalRecords.some((record) => record === undefined)) return undefined
  return {
    schemaVersion: 1,
    projectId: value.projectId as string | undefined,
    reviewedFromSequence: value.reviewedFromSequence as number,
    reviewedToSequence: value.reviewedToSequence as number,
    sourceDraftFingerprint: value.sourceDraftFingerprint,
    sourceBibleFingerprint: value.sourceBibleFingerprint,
    generatedPrompt: value.generatedPrompt,
    proposals: proposalRecords as ContinuityReviewProposalRecord[],
    status: value.status as ContinuityReviewBatchStatus,
    appliedStoryBibleFingerprint: value.appliedStoryBibleFingerprint as string | undefined,
  }
}
