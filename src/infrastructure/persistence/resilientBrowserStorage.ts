export class ResilientBrowserStorage implements Storage {
  private readonly sessionValues = new Map<string, string>()
  private readonly removedKeys = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private hasClearedPersistentStorage = false
  private persistenceFailed = false
  private readonly resolveStorage: () => Storage | undefined

  constructor(resolveStorage: () => Storage | undefined) {
    this.resolveStorage = resolveStorage
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getSnapshot = (): boolean => !this.persistenceFailed

  get length(): number {
    return this.listKeys().length
  }

  clear(): void {
    this.sessionValues.clear()
    this.removedKeys.clear()
    this.hasClearedPersistentStorage = true

    const storage = this.getPersistentStorage()
    if (!storage) return

    try {
      storage.clear()
      this.hasClearedPersistentStorage = false
    } catch {
      this.markPersistenceFailed()
    }
  }

  getItem(key: string): string | null {
    if (this.sessionValues.has(key)) return this.sessionValues.get(key) ?? null
    if (this.hasClearedPersistentStorage || this.removedKeys.has(key)) return null

    const storage = this.getPersistentStorage()
    if (!storage) return null

    try {
      return storage.getItem(key)
    } catch {
      this.markPersistenceFailed()
      return null
    }
  }

  key(index: number): string | null {
    if (!Number.isInteger(index) || index < 0) return null
    return this.listKeys()[index] ?? null
  }

  removeItem(key: string): void {
    this.sessionValues.delete(key)
    this.removedKeys.add(key)
    if (this.hasClearedPersistentStorage) return

    const storage = this.getPersistentStorage()
    if (!storage) return

    try {
      storage.removeItem(key)
      this.removedKeys.delete(key)
    } catch {
      this.markPersistenceFailed()
    }
  }

  setItem(key: string, value: string): void {
    const normalizedValue = String(value)
    this.removedKeys.delete(key)

    if (this.hasClearedPersistentStorage) {
      this.sessionValues.set(key, normalizedValue)
      return
    }

    const storage = this.getPersistentStorage()
    if (!storage) {
      this.sessionValues.set(key, normalizedValue)
      return
    }

    try {
      storage.setItem(key, normalizedValue)
      this.sessionValues.delete(key)
    } catch {
      this.sessionValues.set(key, normalizedValue)
      this.markPersistenceFailed()
    }
  }

  private getPersistentStorage(): Storage | undefined {
    try {
      const storage = this.resolveStorage()
      if (!storage) this.markPersistenceFailed()
      return storage
    } catch {
      this.markPersistenceFailed()
      return undefined
    }
  }

  private listKeys(): string[] {
    const keys = new Set<string>()

    if (!this.hasClearedPersistentStorage) {
      const storage = this.getPersistentStorage()
      if (storage) {
        try {
          for (let index = 0; index < storage.length; index += 1) {
            const key = storage.key(index)
            if (key !== null && !this.removedKeys.has(key)) keys.add(key)
          }
        } catch {
          this.markPersistenceFailed()
        }
      }
    }

    for (const key of this.sessionValues.keys()) keys.add(key)
    return [...keys]
  }

  private markPersistenceFailed(): void {
    if (this.persistenceFailed) return
    this.persistenceFailed = true
    for (const listener of this.listeners) listener()
  }
}
