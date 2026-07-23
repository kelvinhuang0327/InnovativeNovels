import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPwaSnapshot } from '../../application/pwa/pwaPorts'
import {
  BrowserPwaAdapter,
  type BeforeInstallPromptEventLike,
} from './browserPwaAdapter'

function installPromptEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', {
    cancelable: true,
  }) as BeforeInstallPromptEventLike
  const prompt = vi.fn(async () => undefined)

  Object.defineProperties(event, {
    prompt: { value: prompt },
    userChoice: { value: Promise.resolve({ outcome }) },
  })

  return { event, prompt }
}

describe('BrowserPwaAdapter', () => {
  let unsubscribe: (() => void) | undefined

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = undefined
  })

  function observe(
    adapter: BrowserPwaAdapter,
  ): readonly BrowserPwaSnapshot[] {
    const snapshots: BrowserPwaSnapshot[] = []
    unsubscribe = adapter.subscribe((snapshot) => snapshots.push(snapshot))
    return snapshots
  }

  it.each(['accepted', 'dismissed'] as const)(
    'invokes the captured prompt and clears it after an %s outcome',
    async (outcome) => {
      const adapter = new BrowserPwaAdapter(
        window,
        { onLine: true } as Navigator,
        () => false,
      )
      const snapshots = observe(adapter)
      const { event, prompt } = installPromptEvent(outcome)

      window.dispatchEvent(event)
      expect(snapshots.at(-1)?.installAvailable).toBe(true)

      await adapter.requestInstall()

      expect(prompt).toHaveBeenCalledOnce()
      expect(snapshots.at(-1)?.installAvailable).toBe(false)
    },
  )

  it('clears install availability when appinstalled fires', () => {
    const adapter = new BrowserPwaAdapter(
      window,
      { onLine: true } as Navigator,
      () => false,
    )
    const snapshots = observe(adapter)

    window.dispatchEvent(installPromptEvent('accepted').event)
    window.dispatchEvent(new Event('appinstalled'))

    expect(snapshots.at(-1)?.installAvailable).toBe(false)
  })

  it('suppresses install availability in standalone display mode', () => {
    const adapter = new BrowserPwaAdapter(
      window,
      { onLine: true } as Navigator,
      () => true,
    )
    const snapshots = observe(adapter)

    window.dispatchEvent(installPromptEvent('accepted').event)

    expect(snapshots.at(-1)?.installAvailable).toBe(false)
  })

  it('publishes online and offline browser events', () => {
    const adapter = new BrowserPwaAdapter(
      window,
      { onLine: true } as Navigator,
      () => false,
    )
    const snapshots = observe(adapter)

    window.dispatchEvent(new Event('offline'))
    expect(snapshots.at(-1)?.online).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(snapshots.at(-1)?.online).toBe(true)
  })
})
