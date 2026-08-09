import { describe, expect, it } from 'vitest'
import {
  parseAgentDraftExchange,
  type AgentDraftExchange,
} from './agentDraftExchange'

const validExchange = {
  title: '潮汐檔案',
  genre: '科幻懸疑',
  chapters: [
    {
      sequence: 1,
      title: '沉入海底的鐘',
      prose: '海水覆過鐘面，城市在遠處失去第一個音節。',
    },
    {
      sequence: 2,
      title: '舊港的回聲',
      prose: '舊港的霧裡傳來同一段回聲，像有人把昨天折回來。',
    },
    {
      sequence: 3,
      title: '第四點整',
      prose: '第四點整，所有潮汐同時停在半空，留下無法解釋的空白。',
    },
  ],
}

function parse(candidate: unknown) {
  return parseAgentDraftExchange(JSON.stringify(candidate))
}

function errorCodes(candidate: unknown) {
  const result = parse(candidate)
  if (result.ok) {
    return []
  }
  return result.errors.map((error) => error.code)
}

describe('Agent Draft exchange contract', () => {
  it('accepts the three-chapter 潮汐檔案 specimen and preserves its fields', () => {
    const result = parse(validExchange)

    expect(result).toEqual({
      ok: true,
      exchange: validExchange,
    })
  })

  it('normalizes valid chapters into sequence order', () => {
    const result = parse({
      ...validExchange,
      chapters: [validExchange.chapters[2], validExchange.chapters[0], validExchange.chapters[1]],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.exchange.chapters.map((chapter) => chapter.sequence)).toEqual([
        1, 2, 3,
      ])
      expect(result.exchange.chapters.map((chapter) => chapter.title)).toEqual([
        '沉入海底的鐘',
        '舊港的回聲',
        '第四點整',
      ])
    }
  })

  it.each([
    ['invalid syntax', '{', 'INVALID_JSON'],
    ['null root', null, 'ROOT_OBJECT_REQUIRED'],
    ['array root', [], 'ROOT_OBJECT_REQUIRED'],
    ['empty title', { ...validExchange, title: ' ' }, 'TITLE_REQUIRED'],
    ['missing genre', { title: validExchange.title, chapters: validExchange.chapters }, 'GENRE_REQUIRED'],
    ['no chapters', { title: validExchange.title, genre: validExchange.genre, chapters: [] }, 'CHAPTERS_REQUIRED'],
    ['empty prose', { ...validExchange, chapters: [{ ...validExchange.chapters[0], prose: ' ' }] }, 'CHAPTER_PROSE_REQUIRED'],
    ['duplicate sequence', { ...validExchange, chapters: validExchange.chapters.map((chapter) => ({ ...chapter, sequence: 1 })) }, 'DUPLICATE_SEQUENCE'],
    ['sequence gap', { ...validExchange, chapters: validExchange.chapters.map((chapter) => ({ ...chapter, sequence: chapter.sequence + 1 })) }, 'SEQUENCE_GAP'],
    ['unsupported production field', { ...validExchange, published: true }, 'UNSUPPORTED_FIELD'],
    ['markdown fence', '```json\n' + JSON.stringify(validExchange) + '\n```', 'INVALID_JSON'],
    ['prose before JSON', 'Here is your novel:\n' + JSON.stringify(validExchange), 'INVALID_JSON'],
  ])('rejects %s', (_label, candidate, expectedCode) => {
    const result =
      typeof candidate === 'string'
        ? parseAgentDraftExchange(candidate)
        : parse(candidate)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain(expectedCode)
    }
  })

  it('rejects unsupported chapter fields instead of allowing product state control', () => {
    const result = parse({
      ...validExchange,
      chapters: [{ ...validExchange.chapters[0], bookId: 'production-book' }],
    })

    expect(errorCodes({
      ...validExchange,
      chapters: [{ ...validExchange.chapters[0], published: true }],
    })).toContain('UNSUPPORTED_FIELD')
    expect(result.ok).toBe(false)
  })

  it('requires prose to be a raw string rather than silently coercing data', () => {
    const result = parse({
      ...validExchange,
      chapters: [{ ...validExchange.chapters[0], prose: ['第一段'] }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain(
        'CHAPTER_PROSE_REQUIRED',
      )
    }
  })

  it('does not expose a competing production draft shape', () => {
    const result = parse(validExchange)

    expect(result.ok).toBe(true)
    if (result.ok) {
      const exchange: AgentDraftExchange = result.exchange
      expect(exchange).not.toHaveProperty('bookId')
      expect(exchange).not.toHaveProperty('published')
    }
  })
})
