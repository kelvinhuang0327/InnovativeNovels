import {
  CHAPTER_ACCESS,
  type ChapterAccess,
} from './chapterAccess'

export interface ChapterAccessDecision {
  readonly access: ChapterAccess
  readonly canOpen: boolean
  readonly canLoadProse: boolean
}

const deniedDecision = (
  access: typeof CHAPTER_ACCESS.LOCKED | typeof CHAPTER_ACCESS.UNAVAILABLE,
): ChapterAccessDecision => ({
  access,
  canOpen: false,
  canLoadProse: false,
})

export function decideChapterAccess(access: unknown): ChapterAccessDecision {
  switch (access) {
    case CHAPTER_ACCESS.READABLE:
    case CHAPTER_ACCESS.PREVIEW:
      return { access, canOpen: true, canLoadProse: true }
    case CHAPTER_ACCESS.LOCKED:
      return deniedDecision(CHAPTER_ACCESS.LOCKED)
    case CHAPTER_ACCESS.UNAVAILABLE:
    default:
      return deniedDecision(CHAPTER_ACCESS.UNAVAILABLE)
  }
}
