export interface BrowserPwaSnapshot {
  readonly installAvailable: boolean
  readonly online: boolean
}

export interface ServiceWorkerSnapshot {
  readonly updateAvailable: boolean
}

export type SnapshotListener<TSnapshot> = (snapshot: TSnapshot) => void

export interface BrowserPwaPort {
  getSnapshot(): BrowserPwaSnapshot
  subscribe(listener: SnapshotListener<BrowserPwaSnapshot>): () => void
  requestInstall(): Promise<void>
}

export interface ServiceWorkerUpdatePort {
  getSnapshot(): ServiceWorkerSnapshot
  subscribe(listener: SnapshotListener<ServiceWorkerSnapshot>): () => void
  applyUpdate(): Promise<void>
}

export interface PwaDependencies {
  readonly browser: BrowserPwaPort
  readonly serviceWorker: ServiceWorkerUpdatePort
}

export interface PwaState extends BrowserPwaSnapshot, ServiceWorkerSnapshot {}
