import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaControls } from './PwaControls'

function baseProps() {
  return {
    applyUpdate: vi.fn(async () => undefined),
    dismissManualInstallGuidance: vi.fn(),
    installAvailable: false,
    manualInstallAvailable: false,
    manualInstallGuidanceVisible: false,
    online: true,
    requestInstall: vi.fn(async () => undefined),
    updateAvailable: false,
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

  it('announces offline state without claiming a specific item is cached', () => {
    render(<PwaControls {...baseProps()} online={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('目前為離線模式')
    expect(screen.getByRole('status')).not.toHaveTextContent('已快取')
  })

  it('shows a waiting-update prompt and invokes the update action', () => {
    const applyUpdate = vi.fn(async () => undefined)
    render(
      <PwaControls {...baseProps()} applyUpdate={applyUpdate} updateAvailable />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('有新版內容可用')
    fireEvent.click(screen.getByRole('button', { name: '更新應用程式' }))
    expect(applyUpdate).toHaveBeenCalledOnce()
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
