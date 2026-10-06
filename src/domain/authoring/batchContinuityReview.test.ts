import { describe, expect, it } from 'vitest'
import { adaptLegacyBatchArcChapter, evaluateBatchContinuity, parseChapterContinuityMetadata } from './batchContinuityReview'
import { evaluateDraftQuality } from './qualityEvaluator'

describe('batch continuity observations migrated from the legacy critic', () => {
  it('maps the legacy generator index, metadata and plan without assigning publication identity', () => {
    expect(adaptLegacyBatchArcChapter({ index: 7, id: 'legacy-source-8', metadata: {
      summary: '鐘停止了', keyEvents: ['鐘停止'], characterStates: { 林: '警覺' },
      stateDiff: { validChanges: [{ entryId: '鐘', field: '狀態' }] },
      criticTrace: { plan: { goal: '找鐘', hook: '封印為何破裂' } },
    } })).toEqual({ sequence: 8, metadata: {
      sourceChapterIndex: 7, sourceChapterId: 'legacy-source-8', summary: '鐘停止了',
      keyEvents: ['鐘停止'], characterStates: { 林: '警覺' }, worldStateChanges: ['鐘.狀態'],
      mainGoal: '找鐘', endingHook: '封印為何破裂',
    } })
    expect(adaptLegacyBatchArcChapter({ chapterIndex: 12, index: 0, metadata: {} })?.sequence).toBe(13)
    expect(adaptLegacyBatchArcChapter({ metadata: {} })).toBeUndefined()
    expect(adaptLegacyBatchArcChapter({ index: Number.MAX_SAFE_INTEGER })).toBeUndefined()
  })

  it('rejects unbounded or control-bearing metadata instead of stringifying arbitrary values', () => {
    for (const metadata of [{ access: 'READABLE' }, { keyEvents: [null] }, { summary: 'a'.repeat(1201) },
      { setups: Array(21).fill('x') }, { characterStates: { 林: { invented: true } } }]) {
      expect(parseChapterContinuityMetadata(metadata)).toBeUndefined()
    }
  })

  it('does not use a shared character name as evidence of consequence carryover', () => {
    const result = evaluateBatchContinuity([
      { sequence: 1, metadata: { keyEvents: ['橋被封鎖'], characterStates: { 林: '恐懼' }, setups: ['缺角鑰匙'] } },
      { sequence: 2, prose: ['林走進房間。'] },
    ])
    expect(result.status).toBe('REVIEW_NEEDED')
    expect(result.warnings.map((warning) => warning.code)).toEqual(['CONSEQUENCE_LINK_UNCLEAR', 'SETUP_PAYOFF_UNCLEAR'])
    expect(result.warnings[0]).toMatchObject({ chapterSequence: 2, sourceChapterSequences: [1], evidence: [{ field: 'metadata.keyEvents', text: '橋被封鎖' }] })
    expect(result.warnings[0].message).toContain('不是斷裂判定')
  })

  it('uses supplied prose/payoff evidence, including a two-chapter window, without resolving Bible threads', () => {
    const bible = { openThreads: ['缺角鑰匙'] }
    const snapshot = JSON.stringify(bible)
    const result = evaluateBatchContinuity([
      { sequence: 1, metadata: { keyEvents: ['橋被封鎖'], setups: ['缺角鑰匙'] } },
      { sequence: 2, prose: ['橋被封鎖，旅人只好繞行。'] },
      { sequence: 3, metadata: { payoffs: ['缺角鑰匙'] } },
    ], bible)
    expect(result.status).toBe('NO_FLAGS')
    expect(result.warnings).toEqual([])
    expect(result.bibleThreadReferences).toEqual([{ text: '缺角鑰匙', chapterSequences: [3] }])
    expect(JSON.stringify(bible)).toBe(snapshot)
    expect(result).not.toHaveProperty('scoreEstimate')
  })

  it('reports repeated observations as warnings and avoids inherited character-state properties', () => {
    const result = evaluateBatchContinuity([
      { sequence: 1, metadata: { summary: '找鐘', characterStates: { 林: '恐懼', toString: '安全' } } },
      { sequence: 2, metadata: { summary: '找鐘', characterStates: { 林: '恐懼' } } },
    ])
    expect(result.warnings.map((warning) => warning.code)).toEqual(['CHARACTER_STATE_UNCHANGED', 'SUMMARY_REPEATED'])
    expect(result.warnings[0].evidence).toHaveLength(1)
  })

  it('does not invent metadata or compare non-adjacent chapters', () => {
    expect(evaluateBatchContinuity([{ sequence: 1, prose: ['事件'] }, { sequence: 2, prose: ['另一事件'] }]).status).toBe('INSUFFICIENT_DATA')
    expect(evaluateBatchContinuity([{ sequence: 1, metadata: { keyEvents: ['事件'] } }, { sequence: 3 }]).checkedTransitions).toBe(0)
    expect(evaluateBatchContinuity([{ sequence: 1, metadata: { setups: ['伏筆'] } }]).warnings).toEqual([])
  })

  it('composes with format quality as advisory warnings, never hard failures', () => {
    const result = evaluateDraftQuality({ title: '合成測試', categoryLabel: '懸疑', chapters: [
      { sequence: 1, title: '一', prose: ['a','b','c','d','e'], metadata: { keyEvents: ['橋被封鎖'] } },
      { sequence: 2, title: '二', prose: ['f','g','h','i','j'] },
    ] })
    expect(result.status).toBe('WARNING')
    expect(result.hardFailures).toEqual([])
    expect(result.warnings[0].code).toBe('CONSEQUENCE_LINK_UNCLEAR')
  })
})
