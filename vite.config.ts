import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/** Mismo prefijo que en nginx: `/reefer/telemetria/...` → backends HTTP. */
const telemetriaProxy = {
  '/reefer/telemetria/tunel-termoking': {
    target: 'http://161.132.53.51:9051',
    changeOrigin: true,
    rewrite: (p: string) =>
      p.replace(/^\/reefer\/telemetria\/tunel-termoking/, ''),
  },
  '/reefer/telemetria/starcool': {
    target: 'http://161.132.206.104:9112',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/reefer\/telemetria\/starcool/, ''),
  },
} as const

export default defineConfig({
  base: '/reefer/',
  server: {
    port: 3002,
    strictPort: false,
    proxy: telemetriaProxy,
  },
  preview: {
    port: 3002,
    strictPort: false,
    proxy: telemetriaProxy,
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  assetsInclude: ['**/*.svg', '**/*.csv'],
})
