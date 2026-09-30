import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserPwaPort,
  BrowserPwaSnapshot,
  ServiceWorkerSnapshot,
  ServiceWorkerUpdatePort,
  SnapshotListener,
} from '../application/pwa/pwaPorts'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
import { LocalStorageActiveReaderSessionRepository } from '../infrastructure/persistence/localStorageActiveReaderSessionRepository'
import { LocalStorageReadingStateRepository } from '../infrastructure/persistence/localStorageReadingStateRepository'
import App from './App'

class OfflineBrowserPort implements BrowserPwaPort {
  getSnapshot(): BrowserPwaSnapshot {
    return {
      installAvailable: false,
      manualInstallAvailable: false,
      online: false,
    }
  }

  subscribe(listener: SnapshotListener<BrowserPwaSnapshot>) {
    listener(this.getSnapshot())
    return () => undefined
  }

  requestInstall = vi.fn(async () => undefined)
}

class ReconnectingBrowserPort implements BrowserPwaPort {
  private snapshot: BrowserPwaSnapshot
  private readonly listeners = new Set<SnapshotListener<BrowserPwaSnapshot>>()

  constructor(online: boolean) {
    this.snapshot = {
      installAvailable: false,
      manualInstallAvailable: false,
      online,
    }
  }

  getSnapshot(): BrowserPwaSnapshot {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener<BrowserPwaSnapshot>) {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  requestInstall = vi.fn(async (): Promise<void> => undefined)

  setOnline(online: boolean): void {
    this.snapshot = { ...this.snapshot, online }
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}

class IdleServiceWorkerPort implements ServiceWorkerUpdatePort {
  getSnapshot(): ServiceWorkerSnapshot {
    return { updateAvailable: false }
  }

  subscribe(listener: SnapshotListener<ServiceWorkerSnapshot>) {
    listener(this.getSnapshot())
    return () => undefined
  }

  applyUpdate = vi.fn(async () => undefined)
}

describe('App PWA integration', () => {
  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  it('keeps local reader actions available while offline', () => {
    render(
      <App
        dependencies={{
          contentRepository: new StaticContentRepository(),
          readingStateRepository: new LocalStorageReadingStateRepository(
            window.localStorage,
          ),
        }}
        pwaDependencies={{
          browser: new OfflineBrowserPort(),
          serviceWorker: new IdleServiceWorkerPort(),
        }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('目前為離線模式')
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()
    expect(screen.getAllByTestId('chapter-prose').length).toBeGreaterThan(2)
    expect(
      screen.getByText(
        '清晨的第一道潮聲穿過港口時，澄夏在門縫下發現一封帶著鹽晶的信。',
      ),
    ).toBeInTheDocument()
  })

  it('keeps newer local progress through offline-to-online reconnect and session recovery', () => {
    const animationFrames: FrameRequestCallback[] = []
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrames.push(callback)
        return animationFrames.length
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('innerHeight', 400)
    vi.stubGlobal('scrollY', 0)
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })

    const browser = new ReconnectingBrowserPort(false)
    const serviceWorker = new IdleServiceWorkerPort()
    const createDependencies = () => ({
      contentRepository: new StaticContentRepository(),
      readingStateRepository: new LocalStorageReadingStateRepository(
        window.localStorage,
      ),
      activeReaderSessionRepository:
        new LocalStorageActiveReaderSessionRepository(window.localStorage),
    })
    const flushAnimationFrames = () => {
      const callbacks = animationFrames.splice(0)

      act(() => {
        callbacks.forEach((callback) => callback(0))
      })
    }

    const firstMount = render(
      <App
        dependencies={createDependencies()}
        pwaDependencies={{ browser, serviceWorker }}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('目前為離線模式')
    fireEvent.click(screen.getAllByRole('button', { name: '查看書籍' })[0])
    fireEvent.click(screen.getByRole('button', { name: '開始閱讀' }))

    const readerTopRef = { current: 0 }
    const reader = screen.getByLabelText('閱讀器')
    Object.defineProperty(reader, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    vi.spyOn(reader, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: readerTopRef.current + 1000,
      height: 1000,
      left: 0,
      right: 640,
      top: readerTopRef.current,
      width: 640,
      x: 0,
      y: readerTopRef.current,
      toJSON: () => ({}),
    }))
    flushAnimationFrames()

    readerTopRef.current = -420
    vi.stubGlobal('scrollY', 420)
    fireEvent.scroll(window)
    flushAnimationFrames()

    const savedState = JSON.parse(
      window.localStorage.getItem('innovative-novels:reading-state:v1') ?? '{}',
    )
    expect(
      savedState.positions['book-tide-city'].chapterProgress,
    ).toBeCloseTo(0.7, 5)

    act(() => browser.setOnline(true))
    expect(screen.queryByText('目前為離線模式')).not.toBeInTheDocument()

    firstMount.unmount()
    readerTopRef.current = 0
    vi.stubGlobal('scrollY', 0)
    const scrollToSpy = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation((_x?: unknown, y?: unknown) => {
        const targetY = typeof y === 'number' ? y : 0
        vi.stubGlobal('scrollY', targetY)
        readerTopRef.current = -targetY
      })

    render(
      <App
        dependencies={createDependencies()}
        pwaDependencies={{ browser, serviceWorker }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '第一章：潮聲來信' }),
    ).toBeInTheDocument()
    const restoredReader = screen.getByLabelText('閱讀器')
    Object.defineProperty(restoredReader, 'scrollHeight', {
      configurable: true,
      value: 1000,
    })
    vi.spyOn(restoredReader, 'getBoundingClientRect').mockImplementation(() => ({
      bottom: readerTopRef.current + 1000,
      height: 1000,
      left: 0,
      right: 640,
      top: readerTopRef.current,
      width: 640,
      x: 0,
      y: readerTopRef.current,
      toJSON: () => ({}),
    }))
    flushAnimationFrames()

    expect(scrollToSpy).toHaveBeenCalledWith(0, 420)
    expect(
      screen.getByRole('progressbar', { name: '本章閱讀進度' }),
    ).toHaveAttribute('aria-valuenow', '70')
  })
})
