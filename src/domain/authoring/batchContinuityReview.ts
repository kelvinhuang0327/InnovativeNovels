import type { StoryBibleV1 } from './storyBible'

/** Author-supplied observations, never canon or a proof of narrative correctness. */
export interface ChapterContinuityMetadata {
  readonly summary?: string
  readonly keyEvents?: readonly string[]
  readonly characterStates?: Readonly<Record<string, string>>
  readonly setups?: readonly string[]
  readonly payoffs?: readonly string[]
  readonly worldStateChanges?: readonly string[]
  readonly mainGoal?: string
  readonly endingHook?: string
  readonly sourceChapterIndex?: number
  readonly sourceChapterId?: string
}

export interface BatchContinuityChapter {
  readonly sequence: number
  readonly prose?: readonly string[]
  readonly metadata?: ChapterContinuityMetadata
}

export interface BatchContinuityWarning {
  readonly code: 'CONSEQUENCE_LINK_UNCLEAR' | 'SETUP_PAYOFF_UNCLEAR' | 'CHARACTER_STATE_UNCHANGED' | 'SUMMARY_REPEATED'
  readonly message: string
  readonly chapterSequence: number
  readonly sourceChapterSequences: readonly number[]
  readonly evidence: readonly { readonly field: string; readonly text: string }[]
}

export interface BatchContinuityReview {
  readonly status: 'INSUFFICIENT_DATA' | 'REVIEW_NEEDED' | 'NO_FLAGS'
  readonly checkedTransitions: number
  readonly warnings: readonly BatchContinuityWarning[]
  readonly bibleThreadReferences: readonly { readonly text: string; readonly chapterSequences: readonly number[] }[]
}

const textFields = ['summary', 'mainGoal', 'endingHook', 'sourceChapterId'] as const
const listFields = ['keyEvents', 'setups', 'payoffs', 'worldStateChanges'] as const
const fields: readonly string[] = [...textFields, ...listFields, 'characterStates', 'sourceChapterIndex']
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 1200
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Bounded, allowlisted metadata for JSON import and storage; no publication fields. */
export function parseChapterContinuityMetadata(value: unknown): ChapterContinuityMetadata | undefined {
  if (!record(value) || Object.keys(value).some((field) => !fields.includes(field))) return undefined
  for (const field of textFields) {
    if (value[field] !== undefined && !text(value[field])) return undefined
  }
  for (const field of listFields) {
    const entries = value[field]
    if (entries !== undefined && (!Array.isArray(entries) || entries.length > 20 || !entries.every(text))) return undefined
  }
  const states = value.characterStates
  if (states !== undefined && (!record(states) || Object.keys(states).length > 20 ||
      Object.entries(states).some(([name, state]) => !name.trim() || name.length > 120 || !text(state)))) return undefined
  if (value.sourceChapterIndex !== undefined && (!Number.isSafeInteger(value.sourceChapterIndex) || (value.sourceChapterIndex as number) < 0)) return undefined
  return value as ChapterContinuityMetadata
}

/** Legacy zero-based chapterIndex/index -> one-based sequence, retaining source provenance. */
export function adaptLegacyBatchArcChapter(value: unknown): BatchContinuityChapter | undefined {
  if (!record(value)) return undefined
  const index = value.chapterIndex ?? value.index
  if (!Number.isSafeInteger(index) || (index as number) < 0 || index === Number.MAX_SAFE_INTEGER) return undefined
  const meta = record(value.metadata) ? value.metadata : {}
  const trace = record(meta.criticTrace) ? meta.criticTrace : {}
  const plan = record(trace.plan) ? trace.plan : {}
  const diff = record(meta.stateDiff) ? meta.stateDiff : {}
  const metadata = parseChapterContinuityMetadata({
    ...Object.fromEntries([...textFields, ...listFields, 'characterStates'].filter((key) => meta[key] !== undefined).map((key) => [key, meta[key]])),
    ...(plan.goal !== undefined ? { mainGoal: plan.goal } : {}),
    ...(plan.hook !== undefined ? { endingHook: plan.hook } : {}),
    ...(Array.isArray(diff.validChanges) ? {
      worldStateChanges: diff.validChanges.filter(record).map((change) =>
        typeof change.entryId === 'string' && typeof change.field === 'string' ? `${change.entryId}.${change.field}` : undefined),
    } : {}),
    sourceChapterIndex: index,
    ...(typeof value.id === 'string' ? { sourceChapterId: value.id } : {}),
  })
  if (!metadata) return undefined
  return { sequence: (index as number) + 1, metadata }
}

function comparable(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
}

function chapterText(chapter: BatchContinuityChapter): string {
  const m = chapter.metadata
  return comparable([
    ...(chapter.prose ?? []), m?.summary ?? '', ...(m?.keyEvents ?? []),
    ...(m?.payoffs ?? []), ...(m?.worldStateChanges ?? []),
    // A character name alone is deliberately not evidence of consequence carryover.
  ].join('\n'))
}

export function evaluateBatchContinuity(
  chapters: readonly BatchContinuityChapter[],
  storyBible?: Pick<StoryBibleV1, 'openThreads'>,
): BatchContinuityReview {
  const warnings: BatchContinuityWarning[] = []
  let checkedTransitions = 0
  chapters.forEach((chapter, index) => {
    const previous = chapters[index - 1]
    if (!previous || chapter.sequence !== previous.sequence + 1) return
    const prior = previous.metadata
    if (!prior) return
    const obligations = [
      ...(prior.keyEvents ?? []).map((value) => ({ field: 'metadata.keyEvents', text: value })),
      ...(prior.worldStateChanges ?? []).map((value) => ({ field: 'metadata.worldStateChanges', text: value })),
    ].filter((entry) => comparable(entry.text))
    const states = Object.entries(prior.characterStates ?? {}).filter(([, state]) => comparable(state))
    const setups = [...(prior.setups ?? []).map((value) => ({ field: 'metadata.setups', text: value })),
      ...(prior.endingHook ? [{ field: 'metadata.endingHook', text: prior.endingHook }] : [])]
      .filter((entry) => comparable(entry.text))
    if (obligations.length === 0 && states.length === 0 && setups.length === 0 && !prior.summary?.trim()) return
    checkedTransitions++
    const targetText = chapterText(chapter)
    const missing = obligations.filter((entry) => !targetText.includes(comparable(entry.text)))
    if (missing.length) warnings.push({
      code: 'CONSEQUENCE_LINK_UNCLEAR', chapterSequence: chapter.sequence,
      sourceChapterSequences: [previous.sequence], evidence: missing,
      message: `第 ${previous.sequence}→${chapter.sequence} 章：未找到前章事件／世界變更的相同文字。改寫或反轉也可能已承接，請人工核對因果；這不是斷裂判定。`,
    })
    const nextStates = chapter.metadata?.characterStates
    const unchanged = states.filter(([name, state]) => nextStates && Object.hasOwn(nextStates, name) &&
      comparable(nextStates[name]) === comparable(state))
    if (unchanged.length) warnings.push({
      code: 'CHARACTER_STATE_UNCHANGED', chapterSequence: chapter.sequence,
      sourceChapterSequences: [previous.sequence],
      evidence: unchanged.map(([name, state]) => ({ field: `metadata.characterStates.${name}`, text: state })),
      message: `第 ${previous.sequence}→${chapter.sequence} 章：角色狀態註記相同；可能是刻意延續，請確認有沒有漏記變化。`,
    })
    if (prior.summary?.trim() && chapter.metadata?.summary?.trim() && comparable(prior.summary) === comparable(chapter.metadata.summary)) warnings.push({
      code: 'SUMMARY_REPEATED', chapterSequence: chapter.sequence, sourceChapterSequences: [previous.sequence],
      evidence: [{ field: 'metadata.summary', text: prior.summary }],
      message: `第 ${previous.sequence}→${chapter.sequence} 章：摘要相同，請確認主線推進是否被摘要漏記。`,
    })
    const window = chapters.slice(index, index + 2).filter((target, offset) => target.sequence === chapter.sequence + offset)
    const unmatched = setups.filter((entry) => !window.some((target) => chapterText(target).includes(comparable(entry.text))))
    if (unmatched.length) warnings.push({
      code: 'SETUP_PAYOFF_UNCLEAR', chapterSequence: chapter.sequence, sourceChapterSequences: [previous.sequence], evidence: unmatched,
      message: `第 ${previous.sequence} 章的伏筆／hook 未在第 ${window.map((target) => target.sequence).join('、')} 章找到相同文字；可能延後回收或已改寫，請人工追蹤，不會自動更改 Story Bible。`,
    })
  })
  return {
    status: checkedTransitions === 0 ? 'INSUFFICIENT_DATA' : warnings.length ? 'REVIEW_NEEDED' : 'NO_FLAGS',
    checkedTransitions, warnings,
    bibleThreadReferences: (storyBible?.openThreads ?? []).map((thread) => ({
      text: thread,
      chapterSequences: chapters.filter((chapter) => comparable(thread) && chapterText(chapter).includes(comparable(thread))).map((chapter) => chapter.sequence),
    })),
  }
}
