declare const bookIdBrand: unique symbol
declare const chapterIdBrand: unique symbol

export type BookId = string & { readonly [bookIdBrand]: 'BookId' }
export type ChapterId = string & { readonly [chapterIdBrand]: 'ChapterId' }

function requireExplicitId(value: string, name: string): string {
  const normalized = value.trim()

  if (normalized.length === 0) {
    throw new TypeError(`${name} must be an explicit non-empty identifier`)
  }

  return normalized
}

export function bookId(value: string): BookId {
  return requireExplicitId(value, 'BookId') as BookId
}

export function chapterId(value: string): ChapterId {
  return requireExplicitId(value, 'ChapterId') as ChapterId
}
