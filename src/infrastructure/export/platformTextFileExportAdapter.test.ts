import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlatformTextFileExportAdapter } from './platformTextFileExportAdapter'

const file = { filename: 'reading-data.txt', content: '合成筆記\n第二行', mimeType: 'text/plain' as const }

describe('Platform file export', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

  it('passes exact UTF-8 content and filename to iOS and respects cancellation', async () => {
    const native = { exportFile: vi.fn(async () => ({ status: 'cancelled' as const })) }
    const createURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createURL })
    const adapter = new PlatformTextFileExportAdapter(native, () => 'ios')
    expect(await adapter.exportFile(file)).toEqual({ status: 'cancelled' })
    expect(native.exportFile).toHaveBeenCalledWith(file)
    expect(createURL).not.toHaveBeenCalled()
  })

  it('propagates native failure and allows a later successful export', async () => {
    const native = { exportFile: vi.fn()
      .mockRejectedValueOnce(new Error('disk failure'))
      .mockResolvedValueOnce({ status: 'saved', filename: file.filename }) }
    const adapter = new PlatformTextFileExportAdapter(native, () => 'ios')
    await expect(adapter.exportFile(file)).rejects.toThrow('disk failure')
    expect(await adapter.exportFile(file)).toEqual({ status: 'saved', filename: file.filename })
  })

  it('cleans up the browser object URL even when download fails', async () => {
    const revoke = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:export-test'), revokeObjectURL: revoke })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked') })
    const adapter = new PlatformTextFileExportAdapter(undefined, () => 'web')
    await expect(adapter.exportFile(file)).rejects.toThrow('blocked')
    expect(revoke).toHaveBeenCalledWith('blob:export-test')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('reports unsupported native platforms without claiming a download', async () => {
    const native = { exportFile: vi.fn() }
    const adapter = new PlatformTextFileExportAdapter(native, () => 'android')
    await expect(adapter.exportFile(file)).rejects.toThrow('unavailable')
    expect(native.exportFile).not.toHaveBeenCalled()
  })
})
