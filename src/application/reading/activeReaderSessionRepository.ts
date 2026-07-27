export interface ActiveReaderSessionRepository {
  load(): string | undefined
  save(bookId: string): void
  clear(): void
}
