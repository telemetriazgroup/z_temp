import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/** Proxy mismo esquema que nginx: evita Mixed Content (HTTPS → HTTP bloqueado en el navegador). */
const telemetriaProxy = {
  '/telemetria/tunel-termoking': {
    target: 'http://161.132.53.51:9051',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/telemetria\/tunel-termoking/, ''),
  },
  '/telemetria/starcool': {
    target: 'http://161.132.206.104:9112',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/telemetria\/starcool/, ''),
  },
} as const

export default defineConfig({
  // Misma base en dev y prod: la app vive en `/reefer/` (router + assets).
  // No uses un servidor estático genérico sobre `dist/` sin respetar este prefijo:
  // los ficheros están en `dist/assets/` pero las URLs son `/reefer/assets/...`.
  // Para probar el build localmente: `pnpm preview` / `npm run preview` (vite preview).
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
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
