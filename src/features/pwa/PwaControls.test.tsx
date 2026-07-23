import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaControls } from './PwaControls'

describe('PwaControls', () => {
  afterEach(cleanup)

  it('hides install before prompt availability and exposes it afterward', () => {
    const requestInstall = vi.fn(async () => undefined)
    const { rerender } = render(
      <PwaControls
        applyUpdate={vi.fn(async () => undefined)}
        installAvailable={false}
        online
        requestInstall={requestInstall}
        updateAvailable={false}
      />,
    )

    expect(
      screen.queryByRole('button', { name: '安裝應用程式' }),
    ).not.toBeInTheDocument()

    rerender(
      <PwaControls
        applyUpdate={vi.fn(async () => undefined)}
        installAvailable
        online
        requestInstall={requestInstall}
        updateAvailable={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '安裝應用程式' }))

    expect(requestInstall).toHaveBeenCalledOnce()
  })

  it('announces offline state without claiming a specific item is cached', () => {
    render(
      <PwaControls
        applyUpdate={vi.fn(async () => undefined)}
        installAvailable={false}
        online={false}
        requestInstall={vi.fn(async () => undefined)}
        updateAvailable={false}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('目前為離線模式')
    expect(screen.getByRole('status')).not.toHaveTextContent('已快取')
  })

  it('shows a waiting-update prompt and invokes the update action', () => {
    const applyUpdate = vi.fn(async () => undefined)
    render(
      <PwaControls
        applyUpdate={applyUpdate}
        installAvailable={false}
        online
        requestInstall={vi.fn(async () => undefined)}
        updateAvailable
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('有新版內容可用')
    fireEvent.click(screen.getByRole('button', { name: '更新應用程式' }))
    expect(applyUpdate).toHaveBeenCalledOnce()
  })
})
