export const CHAPTER_ACCESS = {
  READABLE: 'READABLE',
  PREVIEW: 'PREVIEW',
  LOCKED: 'LOCKED',
  UNAVAILABLE: 'UNAVAILABLE',
} as const

export type ChapterAccess =
  (typeof CHAPTER_ACCESS)[keyof typeof CHAPTER_ACCESS]
