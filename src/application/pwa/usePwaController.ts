import { useCallback, useEffect, useState } from 'react'
import type { PwaDependencies, PwaState } from './pwaPorts'

export interface PwaController extends PwaState {
  readonly requestInstall: () => Promise<void>
  readonly applyUpdate: () => Promise<void>
  readonly manualInstallGuidanceVisible: boolean
  readonly dismissManualInstallGuidance: () => void
}

export function usePwaController({
  browser,
  serviceWorker,
}: PwaDependencies): PwaController {
  const [browserState, setBrowserState] = useState(() => browser.getSnapshot())
  const [serviceWorkerState, setServiceWorkerState] = useState(() =>
    serviceWorker.getSnapshot(),
  )
  const [manualInstallGuidanceDismissed, setManualInstallGuidanceDismissed] =
    useState(false)

  useEffect(() => browser.subscribe(setBrowserState), [browser])
  useEffect(
    () => serviceWorker.subscribe(setServiceWorkerState),
    [serviceWorker],
  )

  const requestInstall = useCallback(
    () => browser.requestInstall(),
    [browser],
  )
  const applyUpdate = useCallback(
    () => serviceWorker.applyUpdate(),
    [serviceWorker],
  )
  const dismissManualInstallGuidance = useCallback(
    () => setManualInstallGuidanceDismissed(true),
    [],
  )

  return {
    ...browserState,
    ...serviceWorkerState,
    requestInstall,
    applyUpdate,
    manualInstallGuidanceVisible:
      browserState.manualInstallAvailable && !manualInstallGuidanceDismissed,
    dismissManualInstallGuidance,
  }
}
