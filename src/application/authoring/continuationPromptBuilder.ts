import type { AuthoringSpec, Draft } from '../../domain/authoring/authoringContracts'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'
import {
  MAX_CONTINUATION_CHAPTER_COUNT,
  MIN_CONTINUATION_CHAPTER_COUNT,
} from '../../domain/authoring/continuationExchange'

export const CONTINUATION_CONTEXT_CHAPTER_WINDOW = 3

export interface ContinuationContext {
  readonly title: string
  readonly genre: string
  readonly premise: string
  readonly instructions?: string
  readonly existingChapterTitles: readonly string[]
  readonly recentChapters: readonly {
    readonly sequence: number
    readonly title: string
    readonly prose: string
  }[]
}

export type ContinuationPromptResult =
  | {
      readonly ok: true
      readonly prompt: string
      readonly context: ContinuationContext
      readonly expectedStartSequence: number
    }
  | {
      readonly ok: false
      readonly message: string
    }

const EXCHANGE_CONTRACT = `{
  "chapters": [
    {
      "sequence": 4,
      "title": "下一章名稱",
      "prose": "完整小說正文"
    }
  ]
}`

export function buildContinuationContext(
  draft: Draft,
  spec: AuthoringSpec,
): ContinuationContext {
  const recentChapters = draft.chapters.slice(-CONTINUATION_CONTEXT_CHAPTER_WINDOW)

  return {
    title: draft.title.trim(),
    genre: draft.categoryLabel.trim(),
    premise: spec.premise.trim(),
    instructions: spec.instructions?.trim() || undefined,
    existingChapterTitles: draft.chapters.map((chapter) => chapter.title),
    recentChapters: recentChapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: chapter.prose.join('\n\n'),
    })),
  }
}

export function buildContinuationPrompt(
  draft: Draft,
  spec: AuthoringSpec,
  requestedChapterCount: number,
): ContinuationPromptResult {
  if (
    !Number.isInteger(requestedChapterCount) ||
    requestedChapterCount < MIN_CONTINUATION_CHAPTER_COUNT ||
    requestedChapterCount > MAX_CONTINUATION_CHAPTER_COUNT
  ) {
    return {
      ok: false,
      message: `續寫章節數必須是 ${MIN_CONTINUATION_CHAPTER_COUNT} 到 ${MAX_CONTINUATION_CHAPTER_COUNT} 的整數。`,
    }
  }

  const quality = evaluateDraftQuality(draft)
  if (quality.hardFailures.length > 0) {
    return {
      ok: false,
      message: '目前 Draft 有硬性驗證失敗，請先修正後再續寫。',
    }
  }

  const context = buildContinuationContext(draft, spec)
  const expectedStartSequence = draft.chapters.length + 1
  const prompt = [
    'Role: Novel Continuation Agent',
    '',
    'Continue the existing Draft below with new chapters only.',
    `Return exactly ${requestedChapterCount} new chapter(s), starting at sequence ${expectedStartSequence}.`,
    '',
    'Existing Draft context:',
    JSON.stringify(context, null, 2),
    '',
    'Required raw JSON output contract:',
    EXCHANGE_CONTRACT,
    '',
    'Rules:',
    '- Return one JSON object only with the chapters field; no title, genre, BookId, publicationSlug, access, or publication state.',
    '- Output raw JSON only: no Markdown code fence, no preface, no explanation, and no text after the object.',
    `- Return exactly ${requestedChapterCount} new chapters with continuous integer sequences ${expectedStartSequence} through ${expectedStartSequence + requestedChapterCount - 1}.`,
    '- Continue the existing story coherently using the supplied bounded context.',
    '- Do not rewrite, repeat, or return any previous chapter.',
    '- Do not claim publication or create production identifiers.',
    '',
    'Final self-check before responding:',
    '- Confirm the JSON parses as an object with exactly one root field: chapters.',
    `- Confirm there are exactly ${requestedChapterCount} chapters and the first sequence is ${expectedStartSequence}.`,
    '- Confirm the response contains JSON only and contains no production fields.',
  ].join('\n')

  return { ok: true, prompt, context, expectedStartSequence }
}
