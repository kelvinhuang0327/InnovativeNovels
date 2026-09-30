import { useCallback, useEffect, useRef, useState } from 'react'
import type { PwaDependencies, PwaState } from './pwaPorts'

export type PwaActionError = 'install' | 'update'

export interface PwaController extends PwaState {
  readonly requestInstall: () => Promise<void>
  readonly installRequesting: boolean
  readonly pwaActionError: PwaActionError | undefined
  readonly applyUpdate: () => Promise<void>
  readonly updateApplying: boolean
  readonly manualInstallGuidanceVisible: boolean
  readonly dismissManualInstallGuidance: () => void
  readonly updatePromptVisible: boolean
  readonly dismissUpdatePrompt: () => void
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
  const [installRequesting, setInstallRequesting] = useState(false)
  const installRequestingRef = useRef(false)
  const isMountedRef = useRef(false)
  const [pwaActionError, setPwaActionError] = useState<PwaActionError>()
  const [updatePromptDismissed, setUpdatePromptDismissed] = useState(false)
  const [updateApplying, setUpdateApplying] = useState(false)
  const updateApplyingRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])
  useEffect(() => browser.subscribe(setBrowserState), [browser])
  useEffect(
    () =>
      serviceWorker.subscribe((nextState) => {
        setServiceWorkerState(nextState)
        if (!nextState.updateAvailable) {
          setUpdatePromptDismissed(false)
        }
      }),
    [serviceWorker],
  )

  const requestInstall = useCallback(() => {
    if (installRequestingRef.current) {
      return Promise.resolve()
    }

    installRequestingRef.current = true
    setInstallRequesting(true)
    setPwaActionError(undefined)

    try {
      return browser
        .requestInstall()
        .then(
          () => {
            if (isMountedRef.current) {
              setPwaActionError(undefined)
            }
          },
          (error) => {
            if (isMountedRef.current) {
              setPwaActionError('install')
            }
            throw error
          },
        )
        .finally(() => {
          installRequestingRef.current = false
          if (isMountedRef.current) {
            setInstallRequesting(false)
          }
        })
    } catch (error) {
      installRequestingRef.current = false
      if (isMountedRef.current) {
        setInstallRequesting(false)
        setPwaActionError('install')
      }
      return Promise.reject(error)
    }
  }, [browser])
  const applyUpdate = useCallback(() => {
    if (updateApplyingRef.current) {
      return Promise.resolve()
    }

    updateApplyingRef.current = true
    setUpdateApplying(true)
    setPwaActionError(undefined)

    try {
      return serviceWorker
        .applyUpdate()
        .then(
          () => {
            if (isMountedRef.current) {
              setPwaActionError(undefined)
            }
          },
          (error) => {
            if (isMountedRef.current) {
              setPwaActionError('update')
            }
            throw error
          },
        )
        .finally(() => {
          updateApplyingRef.current = false
          setUpdateApplying(false)
        })
    } catch (error) {
      updateApplyingRef.current = false
      setUpdateApplying(false)
      if (isMountedRef.current) {
        setPwaActionError('update')
      }
      return Promise.reject(error)
    }
  }, [serviceWorker])
  const dismissManualInstallGuidance = useCallback(
    () => setManualInstallGuidanceDismissed(true),
    [],
  )
  const dismissUpdatePrompt = useCallback(
    () => setUpdatePromptDismissed(true),
    [],
  )

  return {
    ...browserState,
    ...serviceWorkerState,
    requestInstall,
    installRequesting,
    pwaActionError,
    applyUpdate,
    updateApplying,
    manualInstallGuidanceVisible:
      browserState.manualInstallAvailable && !manualInstallGuidanceDismissed,
    dismissManualInstallGuidance,
    updatePromptVisible:
      serviceWorkerState.updateAvailable && !updatePromptDismissed,
    dismissUpdatePrompt,
  }
}
