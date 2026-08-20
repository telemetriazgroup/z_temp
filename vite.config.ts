import { defineConfig, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/** /reefer → /reefer/ para que F5 y assets no fallen con base '/reefer/'. */
function reeferTrailingSlashRedirect(): Plugin {
  const redirect = (
    req: { url?: string },
    res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void },
    next: () => void
  ) => {
    const raw = req.url ?? ''
    const pathOnly = raw.split('?')[0] ?? ''
    if (pathOnly === '/reefer') {
      const qs = raw.includes('?') ? raw.slice(raw.indexOf('?')) : ''
      res.statusCode = 301
      res.setHeader('Location', `/reefer/${qs}`)
      res.end()
      return
    }
    next()
  }
  return {
    name: 'reefer-trailing-slash-redirect',
    configureServer(server) {
      server.middlewares.use(redirect)
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect)
    },
  }
}

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
  '/reefer/api/correo': {
    target: 'http://127.0.0.1:3003',
    changeOrigin: true,
  },
  '/reefer/api/analisis': {
    target: 'http://127.0.0.1:3003',
    changeOrigin: true,
  },
  '/reefer/api/senal': {
    target: 'http://127.0.0.1:3003',
    changeOrigin: true,
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
    reeferTrailingSlashRedirect(),
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
