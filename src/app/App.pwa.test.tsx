import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserPwaPort,
  BrowserPwaSnapshot,
  ServiceWorkerSnapshot,
  ServiceWorkerUpdatePort,
  SnapshotListener,
} from '../application/pwa/pwaPorts'
import { StaticContentRepository } from '../infrastructure/content/staticContentRepository'
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
    expect(screen.getAllByTestId('chapter-prose')).toHaveLength(2)
  })
})
