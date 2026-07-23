import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  registerSW: vi.fn(),
  updateServiceWorker: vi.fn(async () => undefined),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: mocks.registerSW,
}))

import type { RegisterSWOptions } from 'vite-plugin-pwa/types'
import { ViteServiceWorkerAdapter } from './viteServiceWorkerAdapter'

describe('ViteServiceWorkerAdapter', () => {
  beforeEach(() => {
    mocks.registerSW.mockReset()
    mocks.updateServiceWorker.mockClear()
    mocks.registerSW.mockReturnValue(mocks.updateServiceWorker)
  })

  it('publishes a waiting update and applies it only after user action', async () => {
    const adapter = new ViteServiceWorkerAdapter()
    const snapshots: boolean[] = []

    adapter.subscribe((snapshot) =>
      snapshots.push(snapshot.updateAvailable),
    )
    const options = mocks.registerSW.mock.calls[0]?.[0] as RegisterSWOptions

    expect(mocks.updateServiceWorker).not.toHaveBeenCalled()
    options.onNeedRefresh?.()
    expect(snapshots.at(-1)).toBe(true)

    await adapter.applyUpdate()

    expect(mocks.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(snapshots.at(-1)).toBe(false)
  })
})
