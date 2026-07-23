import { describe, expect, it } from 'vitest'
import type { ManifestOptions } from 'vite-plugin-pwa'
import { pwaOptions } from '../../vite.config'

describe('PWA build contract', () => {
  it('defines an installable standalone manifest with required icon purposes', () => {
    const manifest = pwaOptions.manifest as Partial<ManifestOptions>

    expect(manifest).toMatchObject({
      name: 'InnovativeNovels 創新小說',
      short_name: '創新小說',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#8d3f2f',
      background_color: '#f2eee6',
    })
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    )
  })

  it('uses generated prompt-based Service Worker precaching without runtime features', () => {
    expect(pwaOptions.strategies).toBe('generateSW')
    expect(pwaOptions.registerType).toBe('prompt')
    expect(pwaOptions.workbox).toMatchObject({
      navigateFallback: 'index.html',
      runtimeCaching: [],
    })

    const serialized = JSON.stringify(pwaOptions)
    expect(serialized).not.toMatch(
      /BackgroundSync|backgroundSync|pushManager|runtimeCaching":\s*\[[^\]]/,
    )
  })
})
