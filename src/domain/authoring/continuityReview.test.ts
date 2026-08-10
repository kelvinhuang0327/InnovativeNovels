import { describe, expect, it } from 'vitest'
import type { Draft } from './authoringContracts'
import { evaluateDraftQuality } from './qualityEvaluator'
import {
  advanceContinuityCheckpointAfterDraftEdit,
  applyAcceptedContinuityReview,
  buildContinuityReviewPrompt,
  classifyContinuityProposals,
  completeContinuityReview,
  createContinuityReviewBatch,
  decideContinuityReviewProposal,
  fingerprintContinuityDraftRange,
  fingerprintStoryBible,
  getContinuityReviewStatus,
  importContinuityReviewProposals,
  isContinuityReviewBatchStale,
  parseContinuityReviewProposals,
  type ContinuityReviewBatchV1,
} from './continuityReview'
import { createEmptyStoryBible, type StoryBibleV1 } from './storyBible'

function createDraft(count = 7): Draft {
  const chapters = Array.from({ length: count }, (_, index) => ({
    sequence: index + 1,
    title: `章節 ${index + 1}`,
    prose: [`第 ${index + 1} 章正文。`, `第 ${index + 1} 章第二段。`],
  }))
  return {
    title: '潮汐檔案',
    categoryLabel: '科幻懸疑',
    chapters,
    status: 'DRAFT',
    quality: evaluateDraftQuality({
      title: '潮汐檔案',
      categoryLabel: '科幻懸疑',
      chapters,
    }),
  }
}

const storyBible: StoryBibleV1 = {
  characters: [{ name: '林澄', notes: '追查潮汐裝置。' }],
  worldRules: ['潮汐裝置會記錄沒有被選中的未來。'],
  openThreads: ['下一次低潮前找到第一座鐘。'],
  styleNotes: ['維持克制的科幻懸疑氛圍。'],
}

async function createBatch(
  draft = createDraft(),
  bible = storyBible,
  from = 4,
  to = 5,
): Promise<ContinuityReviewBatchV1> {
  const result = await createContinuityReviewBatch({
    draft,
    specGenre: '科幻懸疑',
    storyBible: bible,
    reviewedFromSequence: from,
    reviewedToSequence: to,
    projectId: 'project-a',
  })
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.message)
  return result.batch
}

describe('Continuity Review V1', () => {
  it('calculates bounded unreviewed ranges and deterministic prompt content', async () => {
    const draft = createDraft()
    const status = getContinuityReviewStatus(draft, 3, 2)
    expect(status.reviewedThroughSequence).toBe(3)
    expect(status.unreviewedChapterSequences).toEqual([4, 5, 6, 7])
    expect(status.nextEligibleRange).toEqual({
      reviewedFromSequence: 4,
      reviewedToSequence: 5,
    })

    const first = buildContinuityReviewPrompt(draft, '科幻懸疑', storyBible, 4, 5)
    const second = buildContinuityReviewPrompt(draft, '科幻懸疑', storyBible, 4, 5)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (first.ok) {
      expect(first.prompt).toContain('Story title: 潮汐檔案')
      expect(first.prompt).toContain('Genre: 科幻懸疑')
      expect(first.prompt).toContain('追查潮汐裝置。')
      expect(first.prompt).toContain('第 4 章正文。')
      expect(first.prompt).toContain('第 5 章第二段。')
      expect(first.prompt).toContain('章節 1')
      expect(first.prompt).not.toContain('第 1 章正文。')
      expect(first.prompt).not.toContain('第 3 章正文。')
      expect(first.prompt).toContain('ADD_CHARACTER')
      expect(first.prompt).toContain('Return one JSON object only')
    }
  })

  it('accepts only 1–5 contiguous chapters for a review batch', async () => {
    const draft = createDraft(7)
    expect((await createBatch(draft, storyBible, 1, 1)).reviewedToSequence).toBe(1)
    expect((await createBatch(draft, storyBible, 1, 5)).reviewedToSequence).toBe(5)
    await expect(createContinuityReviewBatch({
      draft,
      specGenre: '科幻懸疑',
      storyBible,
      reviewedFromSequence: 1,
      reviewedToSequence: 6,
      projectId: 'project-a',
    })).resolves.toMatchObject({ ok: false })
    await expect(createContinuityReviewBatch({
      draft,
      specGenre: '科幻懸疑',
      storyBible,
      reviewedFromSequence: 2,
      reviewedToSequence: 4,
      projectId: 'project-a',
    })).resolves.toMatchObject({ ok: true })
    await expect(createContinuityReviewBatch({
      draft,
      specGenre: '科幻懸疑',
      storyBible,
      reviewedFromSequence: 2,
      reviewedToSequence: 4,
      projectId: 'project-a',
    })).resolves.toEqual(await createContinuityReviewBatch({
      draft,
      specGenre: '科幻懸疑',
      storyBible,
      reviewedFromSequence: 2,
      reviewedToSequence: 4,
      projectId: 'project-a',
    }))
  })

  it('fingerprints only the requested Draft range and semantic Story Bible content', async () => {
    const draft = createDraft()
    const same = await fingerprintContinuityDraftRange(draft, 4, 5)
    const sameAgain = await fingerprintContinuityDraftRange(draft, 4, 5)
    expect(same).toBe(sameAgain)
    expect(await fingerprintContinuityDraftRange({ ...draft, chapters: draft.chapters.map((chapter) => chapter.sequence === 2 ? { ...chapter, prose: ['changed'] } : chapter) }, 4, 5)).toBe(same)
    expect(await fingerprintContinuityDraftRange({ ...draft, chapters: draft.chapters.map((chapter) => chapter.sequence === 4 ? { ...chapter, title: '改變' } : chapter) }, 4, 5)).not.toBe(same)
    expect(await fingerprintStoryBible(storyBible)).not.toBe(await fingerprintStoryBible({ ...storyBible, styleNotes: ['另一個風格約束。'] }))
  })

  it('rejects malformed, fenced, explanatory, unknown, and forbidden proposal payloads', () => {
    const invalidPayloads = [
      '{broken',
      '```json\n{"proposals":[]}\n```',
      'Here is JSON: {"proposals":[]}',
      '{"proposals":[]} trailing',
      '{"proposals":[],"projectId":"x"}',
      '{"proposals":{}}',
      '{"proposals":[{"type":"UNKNOWN","text":"x","reason":"r"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x"}]}',
      '{"proposals":[{"type":"ADD_CHARACTER","name":"","notes":"n","reason":"r"}]}',
      '{"proposals":[{"type":"ADD_CHARACTER","name":"n","notes":"","reason":"r"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"","reason":"r"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":""}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","BookId":"book"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","ChapterId":"chapter"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","projectId":"project"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","targetPublishedBookId":"book"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","publicationSlug":"slug"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","access":"READABLE"}]}',
      '{"proposals":{"characters":[]}}',
      '{"proposals":[{"type":"REPLACE_STORY_BIBLE","storyBible":{},"reason":"r"}]}',
      '{"proposals":[{"type":"ADD_WORLD_RULE","text":"x","reason":"r","lastContinuityReviewedSequence":99}]}',
    ]
    for (const payload of invalidPayloads) {
      expect(parseContinuityReviewProposals(payload).ok, payload).toBe(false)
    }
    expect(parseContinuityReviewProposals('{"proposals":[]}')).toEqual({ ok: true, proposals: [] })
  })

  it('classifies all six operations and prevents conflicts from being accepted', () => {
    const proposals = parseContinuityReviewProposals(JSON.stringify({
      proposals: [
        { type: 'ADD_CHARACTER', name: '新角色', notes: '新備註', reason: 'r' },
        { type: 'UPDATE_CHARACTER', name: '林澄', notes: '完整新備註', reason: 'r' },
        { type: 'ADD_WORLD_RULE', text: '新世界規則', reason: 'r' },
        { type: 'ADD_OPEN_THREAD', text: '新線索', reason: 'r' },
        { type: 'RESOLVE_OPEN_THREAD', text: '下一次低潮前找到第一座鐘。', reason: 'r' },
        { type: 'ADD_STYLE_NOTE', text: '新風格約束', reason: 'r' },
        { type: 'ADD_CHARACTER', name: '林澄', notes: '衝突', reason: 'r' },
        { type: 'UPDATE_CHARACTER', name: '不存在', notes: '衝突', reason: 'r' },
      ],
    }))
    expect(proposals.ok).toBe(true)
    if (!proposals.ok) return
    const classifications = classifyContinuityProposals(storyBible, proposals.proposals)
    expect(classifications.map((item) => item.validity)).toEqual([
      'VALID', 'VALID', 'VALID', 'VALID', 'VALID', 'VALID', 'CONFLICT', 'CONFLICT',
    ])
  })

  it('applies accepted Tide Archive-style proposals transactionally and never stores reasons in the Bible', async () => {
    const draft = createDraft()
    let batch = await createBatch(draft)
    const imported = importContinuityReviewProposals(batch, storyBible, JSON.stringify({
      proposals: [
        { type: 'ADD_WORLD_RULE', text: '部分未被選中的路可能在潮汐壓力下重新靠岸。', reason: '章節 4 證實。' },
        { type: 'ADD_OPEN_THREAD', text: '確認落後林嶼十一秒的第二個聲音是誰。', reason: '章節 5 留下。' },
        { type: 'UPDATE_CHARACTER', name: '林澄', notes: '氣象局工作；主角；追查潮汐裝置與父親留下的線索。', reason: '角色背景明確化。' },
        { type: 'ADD_STYLE_NOTE', text: '避免用大段 exposition 一次解釋全部世界觀。', reason: '保持克制。' },
      ],
    }))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    batch = imported.batch
    for (let index = 0; index < batch.proposals.length; index += 1) {
      const decision = decideContinuityReviewProposal(batch, index, index === 3 ? 'REJECT' : 'ACCEPT')
      expect(decision.ok).toBe(true)
      if (!decision.ok) return
      batch = decision.batch
    }
    const before = structuredClone(storyBible)
    const applied = await applyAcceptedContinuityReview({
      batch,
      draft,
      storyBible,
      activeProjectId: 'project-a',
    })
    expect(applied.ok).toBe(true)
    expect(storyBible).toEqual(before)
    if (!applied.ok) return
    expect(applied.storyBible).toEqual({
      characters: [{ name: '林澄', notes: '氣象局工作；主角；追查潮汐裝置與父親留下的線索。' }],
      worldRules: ['潮汐裝置會記錄沒有被選中的未來。', '部分未被選中的路可能在潮汐壓力下重新靠岸。'],
      openThreads: ['下一次低潮前找到第一座鐘。', '確認落後林嶼十一秒的第二個聲音是誰。'],
      styleNotes: ['維持克制的科幻懸疑氛圍。'],
    })
    expect(JSON.stringify(applied.storyBible)).not.toContain('章節 4 證實')
    expect(applied.batch.proposals.filter((proposal) => proposal.applied)).toHaveLength(3)
    const completed = await completeContinuityReview({
      batch: applied.batch,
      draft,
      storyBible: applied.storyBible,
      activeProjectId: 'project-a',
      currentCheckpoint: 3,
    })
    expect(completed).toMatchObject({ ok: true, checkpoint: 5 })
  })

  it('supports zero-proposal completion without Bible mutation', async () => {
    const draft = createDraft(2)
    let batch = await createBatch(draft, createEmptyStoryBible(), 1, 1)
    const imported = importContinuityReviewProposals(batch, createEmptyStoryBible(), '{"proposals":[]}')
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    batch = imported.batch
    const completed = await completeContinuityReview({
      batch,
      draft,
      storyBible: createEmptyStoryBible(),
      activeProjectId: 'project-a',
      currentCheckpoint: 0,
    })
    expect(completed).toMatchObject({ ok: true, checkpoint: 1 })
  })

  it('applies every allowed operation while preserving unaffected ordering', async () => {
    const emptyBible = createEmptyStoryBible()
    let batch = await createBatch(createDraft(1), emptyBible, 1, 1)
    const imported = importContinuityReviewProposals(batch, emptyBible, JSON.stringify({
      proposals: [
        { type: 'ADD_CHARACTER', name: '新角色', notes: '初始', reason: 'r' },
        { type: 'UPDATE_CHARACTER', name: '新角色', notes: '完整', reason: 'r' },
        { type: 'ADD_WORLD_RULE', text: '規則', reason: 'r' },
        { type: 'ADD_OPEN_THREAD', text: '線索', reason: 'r' },
        { type: 'RESOLVE_OPEN_THREAD', text: '線索', reason: 'r' },
        { type: 'ADD_STYLE_NOTE', text: '風格', reason: 'r' },
      ],
    }))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    batch = imported.batch
    for (let index = 0; index < batch.proposals.length; index += 1) {
      const decision = decideContinuityReviewProposal(batch, index, 'ACCEPT')
      expect(decision.ok).toBe(true)
      if (!decision.ok) return
      batch = decision.batch
    }
    const applied = await applyAcceptedContinuityReview({
      batch,
      draft: createDraft(1),
      storyBible: emptyBible,
      activeProjectId: 'project-a',
    })
    expect(applied).toMatchObject({
      ok: true,
      storyBible: {
        characters: [{ name: '新角色', notes: '完整' }],
        worldRules: ['規則'],
        openThreads: [],
        styleNotes: ['風格'],
      },
    })
  })

  it('refuses stale Draft, stale Bible, project mismatch, and invalid selected transactions without mutation', async () => {
    const draft = createDraft()
    let batch = await createBatch(draft)
    const imported = importContinuityReviewProposals(batch, storyBible, JSON.stringify({
      proposals: [{ type: 'ADD_WORLD_RULE', text: '應該不會套用', reason: 'r' }],
    }))
    expect(imported.ok).toBe(true)
    if (!imported.ok) return
    const accepted = decideContinuityReviewProposal(imported.batch, 0, 'ACCEPT')
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    batch = accepted.batch
    const draftChanged = { ...draft, chapters: draft.chapters.map((chapter) => chapter.sequence === 4 ? { ...chapter, prose: ['changed'] } : chapter) }
    expect(await isContinuityReviewBatchStale(batch, draftChanged, storyBible, 'project-a')).toBe(true)
    const draftApply = await applyAcceptedContinuityReview({ batch, draft: draftChanged, storyBible, activeProjectId: 'project-a' })
    expect(draftApply.ok).toBe(false)
    expect(storyBible.worldRules).toHaveLength(1)
    const bibleApply = await applyAcceptedContinuityReview({ batch, draft, storyBible: { ...storyBible, styleNotes: ['manual edit'] }, activeProjectId: 'project-a' })
    expect(bibleApply.ok).toBe(false)
    const projectApply = await applyAcceptedContinuityReview({ batch, draft, storyBible, activeProjectId: 'project-b' })
    expect(projectApply.ok).toBe(false)
  })

  it('lowers the checkpoint when reviewed Draft content changes and preserves it for appended chapters', () => {
    const draft = createDraft(5)
    const edited = { ...draft, chapters: draft.chapters.map((chapter) => chapter.sequence === 2 ? { ...chapter, title: '改過的第二章' } : chapter) }
    expect(advanceContinuityCheckpointAfterDraftEdit(draft, edited, 3)).toBe(1)
    expect(advanceContinuityCheckpointAfterDraftEdit(draft, { ...draft, chapters: [...draft.chapters, { sequence: 6, title: '第六章', prose: ['新章'] }] }, 3)).toBe(3)
    expect(advanceContinuityCheckpointAfterDraftEdit(draft, draft, 3)).toBe(3)
  })
})
