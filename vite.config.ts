import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// Served from https://<user>.github.io/molding-doe/, so assets resolve under that path.
export default defineConfig({
  base: '/molding-doe/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Molding process development',
        short_name: 'Molding',
        description: 'Scientific molding studies and optional DOE for developing an injection molding process.',
        theme_color: '#1f4e79',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
