export const MIN_CONTINUATION_CHAPTER_COUNT = 1
export const MAX_CONTINUATION_CHAPTER_COUNT = 5
export const DEFAULT_CONTINUATION_CHAPTER_COUNT = 2

export interface ContinuationExchangeChapter {
  readonly sequence: number
  readonly title: string
  readonly prose: string
}

export interface ContinuationExchange {
  readonly chapters: readonly ContinuationExchangeChapter[]
}

export type ContinuationValidationErrorCode =
  | 'INVALID_JSON'
  | 'ROOT_OBJECT_REQUIRED'
  | 'UNSUPPORTED_FIELD'
  | 'CHAPTERS_REQUIRED'
  | 'DRAFT_INVALID'
  | 'CHAPTER_COUNT_INVALID'
  | 'CHAPTER_COUNT_MISMATCH'
  | 'CHAPTER_OBJECT_REQUIRED'
  | 'CHAPTER_SEQUENCE_INVALID'
  | 'CHAPTER_TITLE_REQUIRED'
  | 'CHAPTER_PROSE_REQUIRED'
  | 'DUPLICATE_SEQUENCE'
  | 'SEQUENCE_START_INVALID'
  | 'SEQUENCE_GAP'

export interface ContinuationValidationError {
  readonly code: ContinuationValidationErrorCode
  readonly message: string
  readonly path?: string
}

export type ContinuationExchangeParseResult =
  | {
      readonly ok: true
      readonly exchange: ContinuationExchange
    }
  | {
      readonly ok: false
      readonly errors: readonly ContinuationValidationError[]
    }

interface ContinuationParseOptions {
  readonly expectedStartSequence: number
  readonly requestedChapterCount: number
}

const ROOT_FIELDS = new Set(['chapters'])
const CHAPTER_FIELDS = new Set(['sequence', 'title', 'prose'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unsupportedFieldErrors(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  pathPrefix: string,
): ContinuationValidationError[] {
  return Object.keys(value)
    .filter((key) => !allowedFields.has(key))
    .map((key) => ({
      code: 'UNSUPPORTED_FIELD',
      message: `不支援欄位：${pathPrefix}.${key}。Continuation JSON 只能提出新的 Draft 章節，不得包含書籍識別、發佈或存取欄位。`,
      path: `${pathPrefix}.${key}`,
    }))
}

function parseChapter(
  value: unknown,
  index: number,
): {
  readonly chapter?: ContinuationExchangeChapter
  readonly errors: readonly ContinuationValidationError[]
} {
  const path = `chapters[${index}]`
  if (!isRecord(value)) {
    return {
      errors: [
        {
          code: 'CHAPTER_OBJECT_REQUIRED',
          message: `${path} 必須是物件。`,
          path,
        },
      ],
    }
  }

  const errors = unsupportedFieldErrors(value, CHAPTER_FIELDS, path)
  const sequence = value.sequence
  const title = value.title
  const prose = value.prose

  if (!Number.isInteger(sequence) || (sequence as number) < 1) {
    errors.push({
      code: 'CHAPTER_SEQUENCE_INVALID',
      message: `${path}.sequence 必須是正整數。`,
      path: `${path}.sequence`,
    })
  }

  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push({
      code: 'CHAPTER_TITLE_REQUIRED',
      message: `${path}.title 必須是非空字串。`,
      path: `${path}.title`,
    })
  }

  if (typeof prose !== 'string' || prose.trim().length === 0) {
    errors.push({
      code: 'CHAPTER_PROSE_REQUIRED',
      message: `${path}.prose 必須是非空字串。`,
      path: `${path}.prose`,
    })
  }

  if (errors.length > 0) {
    return { errors }
  }

  return {
    chapter: {
      sequence: sequence as number,
      title: (title as string).trim(),
      prose: (prose as string).trim(),
    },
    errors,
  }
}

export function parseContinuationExchange(
  raw: string,
  options: ContinuationParseOptions,
): ContinuationExchangeParseResult {
  const errors: ContinuationValidationError[] = []
  if (
    !Number.isInteger(options.requestedChapterCount) ||
    options.requestedChapterCount < MIN_CONTINUATION_CHAPTER_COUNT ||
    options.requestedChapterCount > MAX_CONTINUATION_CHAPTER_COUNT
  ) {
    errors.push({
      code: 'CHAPTER_COUNT_INVALID',
      message: `續寫章節數必須是 ${MIN_CONTINUATION_CHAPTER_COUNT} 到 ${MAX_CONTINUATION_CHAPTER_COUNT} 的整數。`,
      path: '$.chapters',
    })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      errors: [
        ...errors,
        {
          code: 'INVALID_JSON',
          message: 'JSON 語法無效。請貼上 raw JSON object only，不要加入說明文字或 Markdown code fence。',
        },
      ],
    }
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: [
        ...errors,
        {
          code: 'ROOT_OBJECT_REQUIRED',
          message: 'Continuation Agent 回應的根內容必須是 JSON 物件。',
          path: '$',
        },
      ],
    }
  }

  errors.push(...unsupportedFieldErrors(parsed, ROOT_FIELDS, '$'))
  const chapters = parsed.chapters

  if (!Array.isArray(chapters) || chapters.length === 0) {
    errors.push({
      code: 'CHAPTERS_REQUIRED',
      message: 'chapters 必須是非空陣列。',
      path: '$.chapters',
    })
  } else if (chapters.length !== options.requestedChapterCount) {
    errors.push({
      code: 'CHAPTER_COUNT_MISMATCH',
      message: `Continuation 必須剛好回傳 ${options.requestedChapterCount} 個新章節，目前收到 ${chapters.length} 個。`,
      path: '$.chapters',
    })
  }

  const parsedChapters: ContinuationExchangeChapter[] = []
  if (Array.isArray(chapters)) {
    chapters.forEach((chapter, index) => {
      const parsedChapter = parseChapter(chapter, index)
      errors.push(...parsedChapter.errors)
      if (parsedChapter.chapter) {
        parsedChapters.push(parsedChapter.chapter)
      }
    })
  }

  const seenSequences = new Set<number>()
  for (const chapter of parsedChapters) {
    if (seenSequences.has(chapter.sequence)) {
      errors.push({
        code: 'DUPLICATE_SEQUENCE',
        message: `章節 sequence ${chapter.sequence} 重複，不能附加到目前 Draft。`,
        path: '$.chapters.sequence',
      })
    }
    seenSequences.add(chapter.sequence)
  }

  if (
    Array.isArray(chapters) &&
    parsedChapters.length === chapters.length &&
    parsedChapters.length > 0
  ) {
    const orderedSequences = parsedChapters
      .map((chapter) => chapter.sequence)
      .sort((left, right) => left - right)
    if (orderedSequences[0] !== options.expectedStartSequence) {
      errors.push({
        code: 'SEQUENCE_START_INVALID',
        message: `續寫必須從第 ${options.expectedStartSequence} 章開始，不能重送既有章節或跳過章節。`,
        path: '$.chapters[0].sequence',
      })
    }

    orderedSequences.forEach((sequence, index) => {
      const expectedSequence = options.expectedStartSequence + index
      if (sequence !== expectedSequence) {
        errors.push({
          code: 'SEQUENCE_GAP',
          message: `續寫章節 sequence 必須從 ${options.expectedStartSequence} 開始連續排列；目前缺少 ${expectedSequence}。`,
          path: '$.chapters.sequence',
        })
      }
    })
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    exchange: {
      chapters: parsedChapters.sort(
        (left, right) => left.sequence - right.sequence,
      ),
    },
  }
}
