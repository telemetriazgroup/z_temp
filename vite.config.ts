import type { IncomingMessage } from 'node:http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** En dev/preview, rutas virtuales tipo /reefer/inicio cargan index.html igual que nginx en Docker. */
function reefSpaFallbackPlugin(): import('vite').Plugin {
  function rewriteReq(req: IncomingMessage): void {
    if (req.method !== 'GET' || req.url == null) return;
    const pathOnly = req.url.split(/[?#]/)[0] ?? '';
    if (!(pathOnly === '/reefer' || pathOnly.startsWith('/reefer/'))) return;
    const isStatic =
      /\.(?:css|js|mjs|cjs|json|ico|png|jpg|jpeg|gif|svg|webp|woff2?|map)$/i.test(pathOnly) ||
      pathOnly.endsWith('.html') ||
      pathOnly.startsWith('/src/') ||
      pathOnly.startsWith('/assets/') ||
      pathOnly.startsWith('/node_modules') ||
      pathOnly.startsWith('/@vite') ||
      pathOnly.startsWith('/@fs');
    if (!isStatic) {
      req.url = '/index.html';
    }
  }
  return {
    name: 'reefer-spa-index-fallback',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteReq(req as IncomingMessage);
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteReq(req as IncomingMessage);
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), reefSpaFallbackPlugin()],
});
