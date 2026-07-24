import type {
  BrowserPwaPort,
  BrowserPwaSnapshot,
  SnapshotListener,
} from '../../application/pwa/pwaPorts'

export interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>
}

type StandaloneDetector = () => boolean
type ManualInstallEligibilityDetector = () => boolean

/**
 * Capability-first iOS/iPadOS manual "Add to Home Screen" eligibility.
 * Desktop-mode iPadOS reports a Mac-like platform, so touch support (not
 * viewport size) is what separates it from an ordinary macOS browser.
 */
export function detectIosManualInstallEligibility(
  browserNavigator: Navigator,
): boolean {
  const userAgent = browserNavigator.userAgent ?? ''
  const platform = browserNavigator.platform ?? ''
  const maxTouchPoints = browserNavigator.maxTouchPoints ?? 0

  const isIPhoneOrIPod = /iPhone|iPod/.test(userAgent)
  const isIPadUserAgent = /iPad/.test(userAgent)
  const isDesktopModeIPad = platform === 'MacIntel' && maxTouchPoints > 1

  return isIPhoneOrIPod || isIPadUserAgent || isDesktopModeIPad
}

export class BrowserPwaAdapter implements BrowserPwaPort {
  private readonly browserWindow: Window
  private readonly detectStandalone: StandaloneDetector
  private readonly manualInstallEligible: boolean
  private installPrompt: BeforeInstallPromptEventLike | undefined
  private listeners = new Set<SnapshotListener<BrowserPwaSnapshot>>()
  private listening = false
  private snapshot: BrowserPwaSnapshot

  private readonly onBeforeInstallPrompt = (event: Event) => {
    event.preventDefault()

    if (this.isStandalone()) {
      this.clearInstallPrompt()
      return
    }

    this.installPrompt = event as BeforeInstallPromptEventLike
    this.updateSnapshot({
      installAvailable: true,
      manualInstallAvailable: this.computeManualInstallAvailable(true),
    })
  }

  private readonly onAppInstalled = () => {
    this.clearInstallPrompt()
  }

  private readonly onOnline = () => {
    this.updateSnapshot({ online: true })
  }

  private readonly onOffline = () => {
    this.updateSnapshot({ online: false })
  }

  constructor(
    browserWindow: Window,
    browserNavigator: Navigator,
    detectStandalone: StandaloneDetector = () =>
      browserWindow.matchMedia?.('(display-mode: standalone)').matches ===
        true ||
      (browserNavigator as Navigator & { readonly standalone?: boolean })
        .standalone === true,
    detectManualInstallEligibility: ManualInstallEligibilityDetector = () =>
      detectIosManualInstallEligibility(browserNavigator),
  ) {
    this.browserWindow = browserWindow
    this.detectStandalone = detectStandalone
    this.manualInstallEligible = detectManualInstallEligibility()
    this.snapshot = {
      installAvailable: false,
      manualInstallAvailable: this.computeManualInstallAvailable(false),
      online: browserNavigator.onLine,
    }
  }

  getSnapshot(): BrowserPwaSnapshot {
    return this.snapshot
  }

  subscribe(listener: SnapshotListener<BrowserPwaSnapshot>): () => void {
    this.listeners.add(listener)
    this.startListening()
    listener(this.snapshot)

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stopListening()
      }
    }
  }

  async requestInstall(): Promise<void> {
    const promptEvent = this.installPrompt

    if (!promptEvent || this.isStandalone()) {
      this.clearInstallPrompt()
      return
    }

    try {
      await promptEvent.prompt()
      await promptEvent.userChoice
    } finally {
      if (this.installPrompt === promptEvent) {
        this.clearInstallPrompt()
      }
    }
  }

  private isStandalone(): boolean {
    return this.detectStandalone()
  }

  private computeManualInstallAvailable(installAvailable: boolean): boolean {
    return (
      this.manualInstallEligible && !this.isStandalone() && !installAvailable
    )
  }

  private startListening(): void {
    if (this.listening) {
      return
    }

    this.browserWindow.addEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPrompt,
    )
    this.browserWindow.addEventListener('appinstalled', this.onAppInstalled)
    this.browserWindow.addEventListener('online', this.onOnline)
    this.browserWindow.addEventListener('offline', this.onOffline)
    this.listening = true
  }

  private stopListening(): void {
    if (!this.listening) {
      return
    }

    this.browserWindow.removeEventListener(
      'beforeinstallprompt',
      this.onBeforeInstallPrompt,
    )
    this.browserWindow.removeEventListener('appinstalled', this.onAppInstalled)
    this.browserWindow.removeEventListener('online', this.onOnline)
    this.browserWindow.removeEventListener('offline', this.onOffline)
    this.listening = false
  }

  private clearInstallPrompt(): void {
    this.installPrompt = undefined
    this.updateSnapshot({
      installAvailable: false,
      manualInstallAvailable: this.computeManualInstallAvailable(false),
    })
  }

  private updateSnapshot(next: Partial<BrowserPwaSnapshot>): void {
    const updated = { ...this.snapshot, ...next }

    if (
      updated.installAvailable === this.snapshot.installAvailable &&
      updated.manualInstallAvailable === this.snapshot.manualInstallAvailable &&
      updated.online === this.snapshot.online
    ) {
      return
    }

    this.snapshot = updated
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }
}
