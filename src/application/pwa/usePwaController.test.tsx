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
      manualInstallAvailable: false,
      online: true,
    })
    const serviceWorker = new FakeServiceWorkerPort({
      updateAvailable: false,
    })
    const { result } = renderHook(() =>
      usePwaController({ browser, serviceWorker }),
    )

    act(() => {
      browser.emit({
        installAvailable: true,
        manualInstallAvailable: false,
        online: false,
      })
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

  describe('manual install guidance session state', () => {
    function eligibleBrowser() {
      return new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: true,
        online: true,
      })
    }

    it('exposes guidance visibility when the environment is eligible', () => {
      const browser = eligibleBrowser()
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      expect(result.current.manualInstallGuidanceVisible).toBe(true)
    })

    it('hides guidance for the current mounted session after dismissal', () => {
      const browser = eligibleBrowser()
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      act(() => result.current.dismissManualInstallGuidance())

      expect(result.current.manualInstallGuidanceVisible).toBe(false)
    })

    it('restores guidance on a fresh mount even after a prior dismissal', () => {
      const firstBrowser = eligibleBrowser()
      const firstServiceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const first = renderHook(() =>
        usePwaController({ browser: firstBrowser, serviceWorker: firstServiceWorker }),
      )
      act(() => first.result.current.dismissManualInstallGuidance())
      expect(first.result.current.manualInstallGuidanceVisible).toBe(false)
      first.unmount()

      const secondBrowser = eligibleBrowser()
      const secondServiceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const second = renderHook(() =>
        usePwaController({ browser: secondBrowser, serviceWorker: secondServiceWorker }),
      )

      expect(second.result.current.manualInstallGuidanceVisible).toBe(true)
    })

    it('never shows guidance when the environment is not eligible', () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      expect(result.current.manualInstallGuidanceVisible).toBe(false)
    })
  })
})
