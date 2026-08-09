import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa'
import { authoringGatewayVitePlugin } from './src/infrastructure/authoring/authoringGatewayVitePlugin.ts'

export const pwaOptions: Partial<VitePWAOptions> = {
  strategies: 'generateSW',
  registerType: 'prompt',
  includeAssets: [
    'favicon.ico',
    'apple-touch-icon-180x180.png',
    'novel-mark.svg',
  ],
  manifest: {
    name: 'InnovativeNovels 創新小說',
    short_name: '創新小說',
    description: '可安裝、可離線續讀的無障礙小說閱讀體驗。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#8d3f2f',
    background_color: '#f2eee6',
    icons: [
      {
        src: 'pwa-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'pwa-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: 'maskable-icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  workbox: {
    cleanupOutdatedCaches: true,
    globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
    navigateFallback: 'index.html',
    runtimeCaching: [],
  },
}

export default defineConfig({
  plugins: [react(), authoringGatewayVitePlugin(), VitePWA(pwaOptions)],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
