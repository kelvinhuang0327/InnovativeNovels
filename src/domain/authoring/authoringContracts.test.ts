import { describe, expect, it } from 'vitest'
import {
  buildGenerationRequest,
  validateAuthoringSpec,
} from './authoringContracts'

describe('authoring contracts', () => {
  it('maps a valid authoring spec to a deterministic provider request', () => {
    const spec = {
      premise: '一名守夜人發現城市的鐘每天少響一聲。',
      genre: '懸疑',
      titleHint: '少一聲的鐘',
      instructions: '保持低調而有張力。',
      requestedChapterCount: 3,
    }

    expect(validateAuthoringSpec(spec)).toEqual([])
    expect(buildGenerationRequest(spec)).toEqual({
      premise: spec.premise,
      genre: spec.genre,
      titleHint: spec.titleHint,
      instructions: spec.instructions,
      requestedChapterCount: 3,
    })
    expect(buildGenerationRequest(spec)).toEqual(buildGenerationRequest(spec))
  })

  it('rejects an empty premise before provider execution', () => {
    expect(
      validateAuthoringSpec({ premise: '   ', genre: '懸疑' }),
    ).toEqual([
      {
        code: 'PREMISE_REQUIRED',
        message: '請輸入故事 premise。',
      },
    ])
  })

  it('bounds the requested chapter count', () => {
    expect(
      validateAuthoringSpec({
        premise: '有一個謎團。',
        genre: '懸疑',
        requestedChapterCount: 7,
      }),
    ).toEqual([
      {
        code: 'CHAPTER_COUNT_INVALID',
        message: '章節數必須是 1 到 6 的整數。',
      },
    ])
  })
})
