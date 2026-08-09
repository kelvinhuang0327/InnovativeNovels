export interface AgentDraftExchangeChapter {
  readonly sequence: number
  readonly title: string
  readonly prose: string
}

export interface AgentDraftExchange {
  readonly title: string
  readonly genre: string
  readonly chapters: readonly AgentDraftExchangeChapter[]
}

export type AgentDraftValidationErrorCode =
  | 'INVALID_JSON'
  | 'ROOT_OBJECT_REQUIRED'
  | 'UNSUPPORTED_FIELD'
  | 'TITLE_REQUIRED'
  | 'GENRE_REQUIRED'
  | 'CHAPTERS_REQUIRED'
  | 'CHAPTER_OBJECT_REQUIRED'
  | 'CHAPTER_SEQUENCE_INVALID'
  | 'CHAPTER_TITLE_REQUIRED'
  | 'CHAPTER_PROSE_REQUIRED'
  | 'DUPLICATE_SEQUENCE'
  | 'SEQUENCE_GAP'

export interface AgentDraftValidationError {
  readonly code: AgentDraftValidationErrorCode
  readonly message: string
  readonly path?: string
}

export type AgentDraftExchangeParseResult =
  | {
      readonly ok: true
      readonly exchange: AgentDraftExchange
    }
  | {
      readonly ok: false
      readonly errors: readonly AgentDraftValidationError[]
    }

const ROOT_FIELDS = new Set(['title', 'genre', 'chapters'])
const CHAPTER_FIELDS = new Set(['sequence', 'title', 'prose'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unsupportedFieldErrors(
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  pathPrefix: string,
): AgentDraftValidationError[] {
  return Object.keys(value)
    .filter((key) => !allowedFields.has(key))
    .map((key) => ({
      code: 'UNSUPPORTED_FIELD',
      message: `不支援欄位：${pathPrefix}.${key}。Agent JSON 不得控制發佈、書籍識別或存取權限。`,
      path: `${pathPrefix}.${key}`,
    }))
}

function parseChapter(
  value: unknown,
  index: number,
): {
  readonly chapter?: AgentDraftExchangeChapter
  readonly errors: readonly AgentDraftValidationError[]
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

export function parseAgentDraftExchange(
  raw: string,
): AgentDraftExchangeParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {
      ok: false,
      errors: [
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
        {
          code: 'ROOT_OBJECT_REQUIRED',
          message: 'Agent 回應的根內容必須是 JSON 物件。',
          path: '$',
        },
      ],
    }
  }

  const errors = unsupportedFieldErrors(parsed, ROOT_FIELDS, '$')
  const title = parsed.title
  const genre = parsed.genre
  const chapters = parsed.chapters

  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push({
      code: 'TITLE_REQUIRED',
      message: 'title 必須是非空字串。',
      path: '$.title',
    })
  }

  if (typeof genre !== 'string' || genre.trim().length === 0) {
    errors.push({
      code: 'GENRE_REQUIRED',
      message: 'genre 必須是非空字串。',
      path: '$.genre',
    })
  }

  if (!Array.isArray(chapters) || chapters.length === 0) {
    errors.push({
      code: 'CHAPTERS_REQUIRED',
      message: 'chapters 必須是非空陣列。',
      path: '$.chapters',
    })
  }

  const parsedChapters: AgentDraftExchangeChapter[] = []
  if (Array.isArray(chapters)) {
    chapters.forEach((chapter, index) => {
      const parsedChapter = parseChapter(chapter, index)
      errors.push(...parsedChapter.errors)
      if (parsedChapter.chapter) {
        parsedChapters.push(parsedChapter.chapter)
      }
    })
  }

  const sequenceCounts = new Map<number, number>()
  for (const chapter of parsedChapters) {
    sequenceCounts.set(
      chapter.sequence,
      (sequenceCounts.get(chapter.sequence) ?? 0) + 1,
    )
  }

  for (const [sequence, count] of sequenceCounts) {
    if (count > 1) {
      errors.push({
        code: 'DUPLICATE_SEQUENCE',
        message: `章節 sequence ${sequence} 重複，不能轉換成 Draft。`,
        path: '$.chapters.sequence',
      })
    }
  }

  if (sequenceCounts.size > 0 && sequenceCounts.size === parsedChapters.length) {
    const orderedSequences = [...sequenceCounts.keys()].sort(
      (left, right) => left - right,
    )
    for (const [index, sequence] of orderedSequences.entries()) {
      const expectedSequence = index + 1
      if (sequence !== expectedSequence) {
        errors.push({
          code: 'SEQUENCE_GAP',
          message: `章節 sequence 必須從 1 連續排列；目前缺少 ${expectedSequence}。`,
          path: '$.chapters.sequence',
        })
        break
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    exchange: {
      title: (title as string).trim(),
      genre: (genre as string).trim(),
      chapters: parsedChapters.sort(
        (left, right) => left.sequence - right.sequence,
      ),
    },
  }
}
