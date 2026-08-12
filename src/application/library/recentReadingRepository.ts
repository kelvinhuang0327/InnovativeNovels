export interface RecentReadingRepository {
  list(): readonly string[]
  touch(bookId: string): void
}
