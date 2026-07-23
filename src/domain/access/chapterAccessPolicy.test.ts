import { describe, expect, it } from 'vitest'
import { CHAPTER_ACCESS } from './chapterAccess'
import { decideChapterAccess } from './chapterAccessPolicy'

describe('ChapterAccessPolicy', () => {
  it.each([CHAPTER_ACCESS.READABLE, CHAPTER_ACCESS.PREVIEW])(
    'allows accessible state %s',
    (access) => {
      expect(decideChapterAccess(access)).toEqual({
        access,
        canOpen: true,
        canLoadProse: true,
      })
    },
  )

  it('denies a locked chapter and suppresses prose loading', () => {
    expect(decideChapterAccess(CHAPTER_ACCESS.LOCKED)).toEqual({
      access: CHAPTER_ACCESS.LOCKED,
      canOpen: false,
      canLoadProse: false,
    })
  })

  it('fails closed for unavailable or unsupported access states', () => {
    expect(decideChapterAccess(CHAPTER_ACCESS.UNAVAILABLE)).toEqual({
      access: CHAPTER_ACCESS.UNAVAILABLE,
      canOpen: false,
      canLoadProse: false,
    })
    expect(decideChapterAccess('UNRECOGNIZED')).toEqual({
      access: CHAPTER_ACCESS.UNAVAILABLE,
      canOpen: false,
      canLoadProse: false,
    })
  })
})
