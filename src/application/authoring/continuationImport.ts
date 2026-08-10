import type { Draft } from '../../domain/authoring/authoringContracts'
import {
  parseContinuationExchange,
  type ContinuationExchange,
  type ContinuationValidationError,
} from '../../domain/authoring/continuationExchange'
import { evaluateDraftQuality } from '../../domain/authoring/qualityEvaluator'

export type ContinuationImportResult =
  | {
      readonly ok: true
      readonly exchange: ContinuationExchange
      readonly draft: Draft
    }
  | {
      readonly ok: false
      readonly errors: readonly ContinuationValidationError[]
    }

function proseToParagraphs(prose: string): readonly string[] {
  return prose
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

export function importContinuation(
  draft: Draft,
  raw: string,
  requestedChapterCount: number,
): ContinuationImportResult {
  const quality = evaluateDraftQuality(draft)
  if (quality.hardFailures.length > 0) {
    return {
      ok: false,
      errors: [
        {
          code: 'DRAFT_INVALID',
          message: '目前 Draft 有硬性驗證失敗，不能附加續寫章節。',
        },
      ],
    }
  }

  const parsed = parseContinuationExchange(raw, {
    expectedStartSequence: draft.chapters.length + 1,
    requestedChapterCount,
  })
  if (!parsed.ok) {
    return parsed
  }

  const nextChapters = parsed.exchange.chapters.map((chapter) => ({
    sequence: chapter.sequence,
    title: chapter.title,
    prose: proseToParagraphs(chapter.prose),
  }))

  return {
    ok: true,
    exchange: parsed.exchange,
    draft: {
      ...draft,
      chapters: [...draft.chapters, ...nextChapters],
      quality: draft.quality,
    },
  }
}
