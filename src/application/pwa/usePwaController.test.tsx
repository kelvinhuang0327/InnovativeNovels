import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  BrowserPwaPort,
  BrowserPwaSnapshot,
  ServiceWorkerSnapshot,
  ServiceWorkerUpdatePort,
  SnapshotListener,
} from './pwaPorts'
import { usePwaController } from './usePwaController'

class FakeBrowserPort implements BrowserPwaPort {
  readonly requestInstall = vi.fn(async () => undefined)
  private listener: SnapshotListener<BrowserPwaSnapshot> | undefined
  private snapshot: BrowserPwaSnapshot

  constructor(snapshot: BrowserPwaSnapshot) {
    this.snapshot = snapshot
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener<BrowserPwaSnapshot>) {
    this.listener = listener
    listener(this.snapshot)
    return () => {
      this.listener = undefined
    }
  }

  emit(snapshot: BrowserPwaSnapshot) {
    this.snapshot = snapshot
    this.listener?.(snapshot)
  }
}

class FakeServiceWorkerPort implements ServiceWorkerUpdatePort {
  readonly applyUpdate = vi.fn(async () => undefined)
  private listener: SnapshotListener<ServiceWorkerSnapshot> | undefined
  private snapshot: ServiceWorkerSnapshot

  constructor(snapshot: ServiceWorkerSnapshot) {
    this.snapshot = snapshot
  }

  getSnapshot() {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener<ServiceWorkerSnapshot>) {
    this.listener = listener
    listener(this.snapshot)
    return () => {
      this.listener = undefined
    }
  }

  emit(snapshot: ServiceWorkerSnapshot) {
    this.snapshot = snapshot
    this.listener?.(snapshot)
  }
}

describe('usePwaController', () => {
  it('flows browser and update adapter state into app-owned state and actions', async () => {
    const browser = new FakeBrowserPort({
      installAvailable: false,
      online: true,
    })
    const serviceWorker = new FakeServiceWorkerPort({
      updateAvailable: false,
    })
    const { result } = renderHook(() =>
      usePwaController({ browser, serviceWorker }),
    )

    act(() => {
      browser.emit({ installAvailable: true, online: false })
      serviceWorker.emit({ updateAvailable: true })
    })

    expect(result.current).toMatchObject({
      installAvailable: true,
      online: false,
      updateAvailable: true,
    })

    await act(() => result.current.requestInstall())
    await act(() => result.current.applyUpdate())

    expect(browser.requestInstall).toHaveBeenCalledOnce()
    expect(serviceWorker.applyUpdate).toHaveBeenCalledOnce()
  })
})
