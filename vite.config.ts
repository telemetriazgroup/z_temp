import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Misma base en dev y prod: la app vive en `/reefer/` (router + assets).
  // No uses un servidor estático genérico sobre `dist/` sin respetar este prefijo:
  // los ficheros están en `dist/assets/` pero las URLs son `/reefer/assets/...`.
  // Para probar el build localmente: `pnpm preview` / `npm run preview` (vite preview).
  base: '/reefer/',
  server: {
    port: 3002,
    strictPort: false,
  },
  preview: {
    port: 3002,
    strictPort: false,
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
