import { describe, expect, it } from 'vitest'
import { MAX_PORTABLE_PROJECT_FILE_BYTES } from '../../application/authoring/portableProjectFilePort'
import { BrowserPortableProjectFileAdapter } from './browserPortableProjectFileAdapter'

describe('BrowserPortableProjectFileAdapter', () => {
  it('rejects oversized files before reading their content', async () => {
    let readCount = 0
    const adapter = new BrowserPortableProjectFileAdapter()

    const result = await adapter.read({
      size: MAX_PORTABLE_PROJECT_FILE_BYTES + 1,
      text: async () => {
        readCount += 1
        return '{}'
      },
    })

    expect(result).toMatchObject({ ok: false, code: 'OVERSIZED_FILE' })
    expect(readCount).toBe(0)
  })

  it('returns file text and maps read failures to bounded errors', async () => {
    const adapter = new BrowserPortableProjectFileAdapter()

    await expect(
      adapter.read({ size: 2, text: async () => '{ }' }),
    ).resolves.toEqual({ ok: true, text: '{ }' })
    await expect(
      adapter.read({
        size: 2,
        text: async () => {
          throw new Error('unreadable')
        },
      }),
    ).resolves.toMatchObject({ ok: false, code: 'UNREADABLE_FILE' })
  })
})
