import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaControls } from './PwaControls'

function baseProps() {
  return {
    applyUpdate: vi.fn(async () => undefined),
    dismissManualInstallGuidance: vi.fn(),
    dismissUpdatePrompt: vi.fn(),
    installAvailable: false,
    installRequesting: false,
    manualInstallAvailable: false,
    manualInstallGuidanceVisible: false,
    online: true,
    pwaActionError: undefined,
    requestInstall: vi.fn(async () => undefined),
    updateAvailable: false,
    updateApplying: false,
    updatePromptVisible: false,
  }
}

describe('PwaControls', () => {
  afterEach(cleanup)

  it('hides install before prompt availability and exposes it afterward', () => {
    const requestInstall = vi.fn(async () => undefined)
    const { rerender } = render(
      <PwaControls {...baseProps()} requestInstall={requestInstall} />,
    )

    expect(
      screen.queryByRole('button', { name: '安裝應用程式' }),
    ).not.toBeInTheDocument()

    rerender(
      <PwaControls
        {...baseProps()}
        installAvailable
        requestInstall={requestInstall}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '安裝應用程式' }))

    expect(requestInstall).toHaveBeenCalledOnce()
  })

  it('shows and disables the install action while the request is pending', () => {
    const requestInstall = vi.fn(async () => undefined)
    render(
      <PwaControls
        {...baseProps()}
        installAvailable
        installRequesting
        requestInstall={requestInstall}
      />,
    )

    const installButton = screen.getByRole('button', { name: '安裝中…' })
    expect(installButton).toBeDisabled()

    fireEvent.click(installButton)

    expect(requestInstall).not.toHaveBeenCalled()
  })

  it('announces offline state without claiming a specific item is cached', () => {
    render(<PwaControls {...baseProps()} online={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('目前為離線模式')
    expect(screen.getByRole('status')).not.toHaveTextContent('已快取')
  })

  it('shows a waiting-update prompt and invokes the update action', () => {
    const applyUpdate = vi.fn(async () => undefined)
    render(
      <PwaControls
        {...baseProps()}
        applyUpdate={applyUpdate}
        updateAvailable
        updatePromptVisible
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('有新版內容可用')
    const updateButton = screen.getByRole('button', { name: '更新應用程式' })
    expect(updateButton).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '稍後' })).not.toBeDisabled()
    fireEvent.click(updateButton)
    expect(applyUpdate).toHaveBeenCalledOnce()
  })

  it('announces an install failure without exposing technical exception text', () => {
    render(<PwaControls {...baseProps()} pwaActionError="install" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('安裝失敗，請再試一次。')
    expect(alert).not.toHaveTextContent('NotAllowedError')
  })

  it('announces an update failure while keeping the update prompt available', () => {
    render(
      <PwaControls
        {...baseProps()}
        pwaActionError="update"
        updateAvailable
        updatePromptVisible
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('更新失敗，請再試一次。')
    expect(alert).not.toHaveTextContent('update failed')
    expect(screen.getByRole('button', { name: '更新應用程式' })).toBeInTheDocument()
  })

  it('consumes rejected action promises at the click boundary', async () => {
    const requestInstall = vi.fn(() => Promise.reject(new Error('install details')))
    const applyUpdate = vi.fn(() => Promise.reject(new Error('update details')))
    const unhandledRejections: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason)
    }

    process.on('unhandledRejection', onUnhandledRejection)
    try {
      render(
        <PwaControls
          {...baseProps()}
          applyUpdate={applyUpdate}
          installAvailable
          requestInstall={requestInstall}
          updateAvailable
          updatePromptVisible
        />,
      )

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '安裝應用程式' }))
        fireEvent.click(screen.getByRole('button', { name: '更新應用程式' }))
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }

    expect(unhandledRejections).toEqual([])
  })

  it('shows and exposes the pending update state through disabled controls', () => {
    render(
      <PwaControls
        {...baseProps()}
        updateAvailable
        updateApplying
        updatePromptVisible
      />,
    )

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.getByRole('button', { name: '更新中…' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: '稍後' })).toBeDisabled()
  })

  it('dismisses the update prompt without applying the update', () => {
    const applyUpdate = vi.fn(async () => undefined)
    const dismissUpdatePrompt = vi.fn()
    const { container, rerender } = render(
      <PwaControls
        {...baseProps()}
        applyUpdate={applyUpdate}
        dismissUpdatePrompt={dismissUpdatePrompt}
        updateAvailable
        updatePromptVisible
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '稍後' }))

    expect(dismissUpdatePrompt).toHaveBeenCalledOnce()
    expect(applyUpdate).not.toHaveBeenCalled()

    rerender(
      <PwaControls
        {...baseProps()}
        applyUpdate={applyUpdate}
        dismissUpdatePrompt={dismissUpdatePrompt}
        updateAvailable
        updatePromptVisible={false}
      />,
    )

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText('有新版內容可用')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '更新應用程式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '稍後' })).not.toBeInTheDocument()
  })

  it('keeps the update prompt visible when manual install guidance is dismissed', () => {
    const dismissManualInstallGuidance = vi.fn()
    render(
      <PwaControls
        {...baseProps()}
        dismissManualInstallGuidance={dismissManualInstallGuidance}
        manualInstallGuidanceVisible
        updateAvailable
        updatePromptVisible
      />,
    )

    fireEvent.click(
      screen.getByRole('button', { name: '關閉加入主畫面說明' }),
    )

    expect(dismissManualInstallGuidance).toHaveBeenCalledOnce()
    expect(screen.getByRole('status')).toHaveTextContent('有新版內容可用')
    expect(screen.getByRole('button', { name: '稍後' })).toBeInTheDocument()
  })

  it('renders nothing when online with no install, update, or guidance state', () => {
    const { container } = render(<PwaControls {...baseProps()} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('manual iOS/iPadOS install guidance', () => {
    it('renders an accessible guidance region when visible', () => {
      render(<PwaControls {...baseProps()} manualInstallGuidanceVisible />)

      expect(
        screen.getByRole('region', { name: '將應用程式加入主畫面' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: '將應用程式加入主畫面' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('list')).toBeInTheDocument()
      expect(screen.getAllByRole('listitem')).toHaveLength(3)
      expect(screen.getByText('選擇「加入主畫面」。')).toBeInTheDocument()
    })

    it('does not render guidance when it is not visible', () => {
      render(<PwaControls {...baseProps()} />)

      expect(
        screen.queryByRole('heading', { name: '將應用程式加入主畫面' }),
      ).not.toBeInTheDocument()
    })

    it('does not render the normal install action alongside manual guidance', () => {
      render(<PwaControls {...baseProps()} manualInstallGuidanceVisible />)

      expect(
        screen.queryByRole('button', { name: '安裝應用程式' }),
      ).not.toBeInTheDocument()
    })

    it('has a dismiss control with an accessible name that invokes the handler', () => {
      const dismissManualInstallGuidance = vi.fn()
      render(
        <PwaControls
          {...baseProps()}
          dismissManualInstallGuidance={dismissManualInstallGuidance}
          manualInstallGuidanceVisible
        />,
      )

      const dismissButton = screen.getByRole('button', {
        name: '關閉加入主畫面說明',
      })
      fireEvent.click(dismissButton)

      expect(dismissManualInstallGuidance).toHaveBeenCalledOnce()
    })
  })
})
