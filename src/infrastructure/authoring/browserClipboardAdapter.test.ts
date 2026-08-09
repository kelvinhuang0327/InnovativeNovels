import { describe, expect, it, vi } from 'vitest'
import { BrowserClipboardAdapter } from './browserClipboardAdapter'

describe('BrowserClipboardAdapter', () => {
  it('uses the browser clipboard when it is available', async () => {
    const writeText = vi.fn(async () => undefined)
    const adapter = new BrowserClipboardAdapter({ writeText })

    await adapter.writeText('Agent prompt')

    expect(writeText).toHaveBeenCalledWith('Agent prompt')
  })

  it('reports unavailable clipboard capability without pretending success', async () => {
    const adapter = new BrowserClipboardAdapter(undefined)

    await expect(adapter.writeText('Agent prompt')).rejects.toThrow(
      'Clipboard API unavailable.',
    )
  })
})
