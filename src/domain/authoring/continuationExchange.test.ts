import { describe, expect, it } from 'vitest'
import {
  parseContinuationExchange,
  type ContinuationExchangeChapter,
} from './continuationExchange'

const chapter = (sequence: number): ContinuationExchangeChapter => ({
  sequence,
  title: `第 ${sequence} 章`,
  prose: `第 ${sequence} 章正文。`,
})

function rawChapters(chapters: readonly ContinuationExchangeChapter[]): string {
  return JSON.stringify({ chapters })
}

function parse(raw: string, requestedChapterCount = 2) {
  return parseContinuationExchange(raw, {
    expectedStartSequence: 4,
    requestedChapterCount,
  })
}

describe('continuation exchange contract', () => {
  it('accepts exactly the requested new chapters from the next sequence', () => {
    const result = parse(rawChapters([chapter(4), chapter(5)]))

    expect(result).toEqual({
      ok: true,
      exchange: { chapters: [chapter(4), chapter(5)] },
    })
  })

  it.each([
    ['invalid JSON', '{broken', 'INVALID_JSON'],
    ['fenced JSON', '```json\n{"chapters":[]}\n```', 'INVALID_JSON'],
    ['prose before JSON', 'Here is the continuation: {"chapters":[]}', 'INVALID_JSON'],
    ['empty chapters', JSON.stringify({ chapters: [] }), 'CHAPTERS_REQUIRED'],
    [
      'wrong requested count',
      rawChapters([chapter(4)]),
      'CHAPTER_COUNT_MISMATCH',
    ],
    [
      'sequence starts at existing N',
      rawChapters([chapter(3), chapter(4)]),
      'SEQUENCE_START_INVALID',
    ],
    [
      'sequence starts at N+2',
      rawChapters([chapter(5), chapter(6)]),
      'SEQUENCE_START_INVALID',
    ],
    [
      'sequence gap',
      rawChapters([chapter(4), chapter(6)]),
      'SEQUENCE_GAP',
    ],
    [
      'duplicate sequence',
      rawChapters([chapter(4), chapter(4)]),
      'DUPLICATE_SEQUENCE',
    ],
    [
      'empty title',
      rawChapters([{ ...chapter(4), title: '' }, chapter(5)]),
      'CHAPTER_TITLE_REQUIRED',
    ],
    [
      'empty prose',
      rawChapters([{ ...chapter(4), prose: '  ' }, chapter(5)]),
      'CHAPTER_PROSE_REQUIRED',
    ],
    [
      'unexpected production identity',
      JSON.stringify({ chapters: [chapter(4), chapter(5)], BookId: 'book-tide-archive' }),
      'UNSUPPORTED_FIELD',
    ],
    [
      'unexpected access field',
      JSON.stringify({ chapters: [{ ...chapter(4), access: 'READABLE' }, chapter(5)] }),
      'UNSUPPORTED_FIELD',
    ],
    [
      'unexpected publication slug',
      JSON.stringify({ chapters: [chapter(4), chapter(5)], publicationSlug: 'tide-archive' }),
      'UNSUPPORTED_FIELD',
    ],
  ])('rejects %s', (_description, raw, code) => {
    const result = parse(raw)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain(code)
    }
  })

  it('rejects a requested count outside the bounded V1 range', () => {
    const result = parse(rawChapters([chapter(4)]), 6)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((error) => error.code)).toContain(
        'CHAPTER_COUNT_INVALID',
      )
    }
  })
})
