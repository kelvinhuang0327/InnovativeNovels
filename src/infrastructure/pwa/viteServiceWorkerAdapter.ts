import { registerSW } from 'virtual:pwa-register'
import type {
  ServiceWorkerSnapshot,
  ServiceWorkerUpdatePort,
  SnapshotListener,
} from '../../application/pwa/pwaPorts'

export class ViteServiceWorkerAdapter implements ServiceWorkerUpdatePort {
  private listeners = new Set<SnapshotListener<ServiceWorkerSnapshot>>()
  private snapshot: ServiceWorkerSnapshot = { updateAvailable: false }
  private started = false
  private updateServiceWorker:
    | ((reloadPage?: boolean) => Promise<void>)
    | undefined

  getSnapshot(): ServiceWorkerSnapshot {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener<ServiceWorkerSnapshot>): () => void {
    this.listeners.add(listener)
    this.start()
    listener(this.snapshot)

    return () => {
      this.listeners.delete(listener)
    }
  }

  async applyUpdate(): Promise<void> {
    if (!this.snapshot.updateAvailable || !this.updateServiceWorker) {
      return
    }

    this.setUpdateAvailable(false)

    try {
      await this.updateServiceWorker(true)
    } catch (error) {
      this.setUpdateAvailable(true)
      throw error
    }
  }

  private start(): void {
    if (this.started) {
      return
    }

    this.started = true
    this.updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh: () => this.setUpdateAvailable(true),
    })
  }

  private setUpdateAvailable(updateAvailable: boolean): void {
    if (this.snapshot.updateAvailable === updateAvailable) {
      return
    }

    this.snapshot = { updateAvailable }
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}
