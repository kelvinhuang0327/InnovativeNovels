import { describe, expect, it } from 'vitest'
import { importAgentDraft } from './agentDraftImport'
import { importContinuation } from './continuationImport'
import { exportDraftJson } from './draftExport'
import { createAuthoringDraft } from './createDraftUseCase'
import { createEmptyAuthoringSession } from './authoringSessionDefaults'
import { parseAuthoringSession, serializeAuthoringSession } from '../../infrastructure/persistence/localStorageAuthoringSessionRepository'
import { createContinuityReviewBatch, isContinuityReviewBatchStale } from '../../domain/authoring/continuityReview'
import { createEmptyStoryBible } from '../../domain/authoring/storyBible'
import { updateDraftChapter } from '../../domain/authoring/draftEditing'
import type { Draft } from '../../domain/authoring/authoringContracts'
import { buildPublicationCandidate } from '../../domain/authoring/publicationCandidate'

const exchange = { title: '合成批章', genre: '懸疑', chapters: [
  { sequence: 1, title: '鐘', prose: '第一段\n\n第二段\n\n第三段\n\n第四段\n\n第五段',
    metadata: { sourceChapterIndex: 0, sourceChapterId: 'synthetic-source', summary: '鐘停止', keyEvents: ['鐘停止'], setups: ['缺角鑰匙'] } },
  { sequence: 2, title: '房間', prose: '第六段\n\n第七段\n\n第八段\n\n第九段\n\n第十段', metadata: { summary: '走進房間' } },
] }

function imported(): Draft {
  const result = importAgentDraft(JSON.stringify(exchange))
  if (!result.ok) throw new Error('Synthetic fixture must import')
  return result.draft
}

describe('live authoring batch continuity integration', () => {
  it('preserves warning provenance in authoring candidates while keeping Reader content metadata-free', () => {
    const result = buildPublicationCandidate(imported(), { publicationSlug: 'synthetic-arc', authorName: '合成測試', description: '測試', catalogSequence: 100 })
    expect(result.readiness).toBe('READY_WITH_WARNINGS')
    expect(result.issues).toEqual([])
    expect(result.warnings[0]).toMatchObject({ sourceChapterSequences: [1], evidence: [{ field: 'metadata.keyEvents', text: '鐘停止' }] })
    expect(result.candidate?.chapters[0]).not.toHaveProperty('metadata')
    expect(result.candidate?.chapters[0].prose).toEqual(imported().chapters[0].prose)
  })
  it('keeps source metadata and advisory quality through JSON export and session restart', () => {
    const draft = imported()
    expect(draft.quality.hardFailures).toEqual([])
    expect(draft.quality.warnings.map((warning) => warning.code)).toEqual(['CONSEQUENCE_LINK_UNCLEAR', 'SETUP_PAYOFF_UNCLEAR'])
    const exported = importAgentDraft(exportDraftJson(draft))
    expect(exported.ok && exported.draft.chapters).toEqual(draft.chapters)
    const restored = parseAuthoringSession(serializeAuthoringSession({ ...createEmptyAuthoringSession(), draft }))
    expect(restored?.draft?.chapters).toEqual(draft.chapters)
    expect(restored?.draft?.quality).toEqual(draft.quality)
  })

  it('retains metadata on newly appended chapters without overwriting existing chapters', () => {
    const draft = imported()
    const result = importContinuation(draft, JSON.stringify({ chapters: [{ sequence: 3, title: '鑰匙', prose: '缺角鑰匙打開門。', metadata: { payoffs: ['缺角鑰匙'] } }] }), 1)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('Continuation failed')
    expect(result.draft.chapters.slice(0, 2)).toEqual(draft.chapters)
    expect(result.draft.chapters[2].metadata?.payoffs).toEqual(['缺角鑰匙'])
  })

  it('rejects metadata carrying publication control and corrupted saved observations', () => {
    const bad = { ...exchange, chapters: [{ ...exchange.chapters[0], metadata: { access: 'READABLE' } }] }
    const result = importAgentDraft(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0].code).toBe('CHAPTER_METADATA_INVALID')
    const stored = JSON.parse(serializeAuthoringSession({ ...createEmptyAuthoringSession(), draft: imported() }))
    stored.draft.chapters[0].metadata.keyEvents = [false]
    expect(parseAuthoringSession(JSON.stringify(stored))).toBeUndefined()
  })

  it('preserves provider metadata and treats invalid observations as a provider error', async () => {
    const draft = imported()
    const spec = { premise: '合成故事', genre: '懸疑', requestedChapterCount: 2 }
    const result = await createAuthoringDraft(spec, { provider: { name: 'synthetic', generateDraft: async () => draft } })
    expect(result.ok && result.draft.chapters[0].metadata).toEqual(draft.chapters[0].metadata)
    const invalid = await createAuthoringDraft(spec, { provider: { name: 'synthetic', generateDraft: async () => ({ ...draft, chapters: [{ ...draft.chapters[0], metadata: { keyEvents: [false] } }] } as unknown as Draft) } })
    expect(invalid).toMatchObject({ ok: false, status: 'provider_error' })
  })

  it('includes observations in review prompts/fingerprints and invalidates them when prose changes', async () => {
    const draft = imported()
    const bible = createEmptyStoryBible()
    const result = await createContinuityReviewBatch({ draft, specGenre: '懸疑', storyBible: bible, reviewedFromSequence: 1, reviewedToSequence: 2 })
    if (!result.ok) throw new Error(result.message)
    expect(result.batch.generatedPrompt).toContain('CONSEQUENCE_LINK_UNCLEAR')
    expect(result.batch.generatedPrompt).toContain('not proof of correctness')
    const changed: Draft = { ...draft, chapters: draft.chapters.map((chapter) => chapter.sequence === 1 ? { ...chapter, metadata: { keyEvents: ['鐘啟動'] } } : chapter) }
    expect(await isContinuityReviewBatchStale(result.batch, changed, bible)).toBe(true)
    expect(updateDraftChapter(draft, 1, { title: '新標題' }).chapters[0].metadata).toEqual(draft.chapters[0].metadata)
    expect(updateDraftChapter(draft, 1, { prose: ['正文已修改'] }).chapters[0].metadata).toBeUndefined()
  })
})
