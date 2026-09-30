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
  readonly requestInstall = vi.fn(async (): Promise<void> => undefined)
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
  readonly applyUpdate = vi.fn(async (): Promise<void> => undefined)
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

function createDeferred() {
  let resolve!: () => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
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
      updatePromptVisible: true,
    })

    await act(() => result.current.requestInstall())
    await act(() => result.current.applyUpdate())

    expect(browser.requestInstall).toHaveBeenCalledOnce()
    expect(serviceWorker.applyUpdate).toHaveBeenCalledOnce()
  })

  describe('update application pending state', () => {
    it('prevents duplicate applications and restores state after resolving', async () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: true,
      })
      const deferred = createDeferred()
      serviceWorker.applyUpdate.mockReturnValueOnce(deferred.promise)
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      expect(result.current.updateApplying).toBe(false)

      let firstAttempt!: Promise<void>
      act(() => {
        firstAttempt = result.current.applyUpdate()
      })

      expect(result.current.updateApplying).toBe(true)
      expect(result.current.updateAvailable).toBe(true)
      expect(result.current.updatePromptVisible).toBe(true)
      expect(serviceWorker.applyUpdate).toHaveBeenCalledOnce()

      let duplicateAttempt!: Promise<void>
      act(() => {
        duplicateAttempt = result.current.applyUpdate()
      })

      expect(result.current.updateApplying).toBe(true)
      expect(serviceWorker.applyUpdate).toHaveBeenCalledOnce()
      await duplicateAttempt

      await act(async () => {
        deferred.resolve()
        await firstAttempt
      })

      expect(result.current.updateApplying).toBe(false)
      expect(result.current.updateAvailable).toBe(true)
      expect(result.current.updatePromptVisible).toBe(true)
    })

    it('restores state after rejection, preserves the error, and permits retry', async () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: true,
      })
      const firstAttemptDeferred = createDeferred()
      const retryDeferred = createDeferred()
      serviceWorker.applyUpdate
        .mockReturnValueOnce(firstAttemptDeferred.promise)
        .mockReturnValueOnce(retryDeferred.promise)
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      let firstAttempt!: Promise<void>
      act(() => {
        firstAttempt = result.current.applyUpdate()
      })
      expect(result.current.updateApplying).toBe(true)

      const error = new Error('update failed')
      await act(async () => {
        firstAttemptDeferred.reject(error)
        await expect(firstAttempt).rejects.toBe(error)
      })

      expect(result.current.updateApplying).toBe(false)
      expect(result.current.updateAvailable).toBe(true)
      expect(result.current.updatePromptVisible).toBe(true)
      expect(result.current.pwaActionError).toBe('update')
      expect(serviceWorker.applyUpdate).toHaveBeenCalledOnce()

      let retryAttempt!: Promise<void>
      act(() => {
        retryAttempt = result.current.applyUpdate()
      })
      expect(result.current.updateApplying).toBe(true)
      expect(result.current.pwaActionError).toBeUndefined()
      expect(serviceWorker.applyUpdate).toHaveBeenCalledTimes(2)

      await act(async () => {
        retryDeferred.resolve()
        await retryAttempt
      })

      expect(result.current.updateApplying).toBe(false)
      expect(result.current.pwaActionError).toBeUndefined()
    })
  })

  describe('install request pending state', () => {
    it('prevents duplicate requests and restores state after resolving', async () => {
      const browser = new FakeBrowserPort({
        installAvailable: true,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const deferred = createDeferred()
      browser.requestInstall.mockReturnValueOnce(deferred.promise)
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      expect(result.current.installRequesting).toBe(false)

      let firstAttempt!: Promise<void>
      act(() => {
        firstAttempt = result.current.requestInstall()
      })

      expect(result.current.installRequesting).toBe(true)
      expect(result.current.installAvailable).toBe(true)
      expect(browser.requestInstall).toHaveBeenCalledOnce()

      let duplicateAttempt!: Promise<void>
      act(() => {
        duplicateAttempt = result.current.requestInstall()
      })

      expect(result.current.installRequesting).toBe(true)
      expect(browser.requestInstall).toHaveBeenCalledOnce()
      await duplicateAttempt

      await act(async () => {
        deferred.resolve()
        await firstAttempt
      })

      expect(result.current.installRequesting).toBe(false)
      expect(result.current.installAvailable).toBe(true)
    })

    it('restores state after rejection, preserves the error, and permits retry', async () => {
      const browser = new FakeBrowserPort({
        installAvailable: true,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: false,
      })
      const firstAttemptDeferred = createDeferred()
      const retryDeferred = createDeferred()
      browser.requestInstall
        .mockReturnValueOnce(firstAttemptDeferred.promise)
        .mockReturnValueOnce(retryDeferred.promise)
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      let firstAttempt!: Promise<void>
      act(() => {
        firstAttempt = result.current.requestInstall()
      })
      expect(result.current.installRequesting).toBe(true)

      const error = new Error('install failed')
      await act(async () => {
        firstAttemptDeferred.reject(error)
        await expect(firstAttempt).rejects.toBe(error)
      })

      expect(result.current.installRequesting).toBe(false)
      expect(result.current.installAvailable).toBe(true)
      expect(result.current.pwaActionError).toBe('install')
      expect(browser.requestInstall).toHaveBeenCalledOnce()

      let retryAttempt!: Promise<void>
      act(() => {
        retryAttempt = result.current.requestInstall()
      })
      expect(result.current.installRequesting).toBe(true)
      expect(result.current.pwaActionError).toBeUndefined()
      expect(browser.requestInstall).toHaveBeenCalledTimes(2)

      await act(async () => {
        retryDeferred.resolve()
        await retryAttempt
      })

      expect(result.current.installRequesting).toBe(false)
      expect(result.current.installAvailable).toBe(true)
      expect(result.current.pwaActionError).toBeUndefined()
    })
  })

  describe('update prompt session state', () => {
    it('hides the prompt without applying the update or changing update state', () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: true,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      expect(result.current.updatePromptVisible).toBe(true)

      act(() => result.current.dismissUpdatePrompt())

      expect(result.current.updateAvailable).toBe(true)
      expect(result.current.updatePromptVisible).toBe(false)
      expect(serviceWorker.applyUpdate).not.toHaveBeenCalled()
    })

    it('keeps dismissal while available and resets it for a later update cycle', () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: false,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: true,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      act(() => result.current.dismissUpdatePrompt())
      expect(result.current.updatePromptVisible).toBe(false)

      act(() => serviceWorker.emit({ updateAvailable: true }))
      expect(result.current.updatePromptVisible).toBe(false)

      act(() => serviceWorker.emit({ updateAvailable: false }))
      expect(result.current.updateAvailable).toBe(false)

      act(() => serviceWorker.emit({ updateAvailable: true }))
      expect(result.current.updateAvailable).toBe(true)
      expect(result.current.updatePromptVisible).toBe(true)
    })

    it('keeps manual install guidance dismissal independent from update dismissal', () => {
      const browser = new FakeBrowserPort({
        installAvailable: false,
        manualInstallAvailable: true,
        online: true,
      })
      const serviceWorker = new FakeServiceWorkerPort({
        updateAvailable: true,
      })
      const { result } = renderHook(() =>
        usePwaController({ browser, serviceWorker }),
      )

      act(() => result.current.dismissUpdatePrompt())

      expect(result.current.manualInstallGuidanceVisible).toBe(true)
      expect(result.current.updatePromptVisible).toBe(false)

      act(() => serviceWorker.emit({ updateAvailable: false }))
      act(() => serviceWorker.emit({ updateAvailable: true }))

      expect(result.current.updatePromptVisible).toBe(true)

      act(() => result.current.dismissManualInstallGuidance())

      expect(result.current.manualInstallGuidanceVisible).toBe(false)
      expect(result.current.updatePromptVisible).toBe(true)
    })
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
