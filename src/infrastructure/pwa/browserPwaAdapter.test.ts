import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BrowserPwaSnapshot } from '../../application/pwa/pwaPorts'
import {
  BrowserPwaAdapter,
  detectIosManualInstallEligibility,
  type BeforeInstallPromptEventLike,
} from './browserPwaAdapter'

const IPHONE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
const IPAD_USER_AGENT =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15'
const MACOS_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
const WINDOWS_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const ANDROID_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'

function navigatorLike(
  overrides: Partial<Navigator> & { readonly onLine?: boolean },
): Navigator {
  return { onLine: true, ...overrides } as Navigator
}

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

  describe('manual iOS/iPadOS install guidance', () => {
    it('is available in an iPhone-like context with no normal prompt', () => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({ userAgent: IPHONE_USER_AGENT }),
        () => false,
      )
      const snapshots = observe(adapter)

      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(true)
      expect(snapshots.at(-1)?.installAvailable).toBe(false)
    })

    it('is available in an iPad context (native iPad user agent)', () => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({ userAgent: IPAD_USER_AGENT }),
        () => false,
      )
      const snapshots = observe(adapter)

      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(true)
    })

    it('does not appear in an ordinary macOS desktop context', () => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({
          userAgent: MACOS_USER_AGENT,
          platform: 'MacIntel',
          maxTouchPoints: 0,
        }),
        () => false,
      )
      const snapshots = observe(adapter)

      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(false)
    })

    it.each([
      ['Windows', WINDOWS_USER_AGENT],
      ['Android', ANDROID_USER_AGENT],
    ])('does not appear in an unsupported %s context', (_label, userAgent) => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({ userAgent }),
        () => false,
      )
      const snapshots = observe(adapter)

      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(false)
    })

    it('lets the normal browser install prompt take precedence when both are eligible', () => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({ userAgent: IPHONE_USER_AGENT }),
        () => false,
      )
      const snapshots = observe(adapter)
      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(true)

      window.dispatchEvent(installPromptEvent('accepted').event)

      expect(snapshots.at(-1)?.installAvailable).toBe(true)
      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(false)
    })

    it('is suppressed in standalone display mode', () => {
      const adapter = new BrowserPwaAdapter(
        window,
        navigatorLike({ userAgent: IPHONE_USER_AGENT }),
        () => true,
      )
      const snapshots = observe(adapter)

      expect(snapshots.at(-1)?.manualInstallAvailable).toBe(false)
      expect(snapshots.at(-1)?.installAvailable).toBe(false)
    })
  })

  describe('detectIosManualInstallEligibility', () => {
    it('recognizes iPhone and iPod user agents', () => {
      expect(
        detectIosManualInstallEligibility(
          navigatorLike({ userAgent: IPHONE_USER_AGENT }),
        ),
      ).toBe(true)
    })

    it('recognizes an iPad user agent', () => {
      expect(
        detectIosManualInstallEligibility(
          navigatorLike({ userAgent: IPAD_USER_AGENT }),
        ),
      ).toBe(true)
    })

    it('recognizes desktop-mode iPadOS via MacIntel platform plus multi-touch', () => {
      expect(
        detectIosManualInstallEligibility(
          navigatorLike({
            userAgent: MACOS_USER_AGENT,
            platform: 'MacIntel',
            maxTouchPoints: 5,
          }),
        ),
      ).toBe(true)
    })

    it('rejects an ordinary macOS desktop browser with no touch support', () => {
      expect(
        detectIosManualInstallEligibility(
          navigatorLike({
            userAgent: MACOS_USER_AGENT,
            platform: 'MacIntel',
            maxTouchPoints: 0,
          }),
        ),
      ).toBe(false)
    })

    it.each([
      ['Windows', WINDOWS_USER_AGENT],
      ['Android', ANDROID_USER_AGENT],
    ])('rejects %s contexts', (_label, userAgent) => {
      expect(
        detectIosManualInstallEligibility(navigatorLike({ userAgent })),
      ).toBe(false)
    })
  })
})
