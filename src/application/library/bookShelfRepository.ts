export interface BookShelfRepository {
  list(): readonly string[]
  contains(bookId: string): boolean
  add(bookId: string): void
  remove(bookId: string): void
}
