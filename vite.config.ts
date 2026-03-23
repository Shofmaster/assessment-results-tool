import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import { lookupFaaRegistryByNNumber, parseTailForFaaQuery } from './src/services/faaRegistryLookup';

/** Serves GET /api/faa-nnumber in local dev (same behavior as Vercel serverless). */
function faaNNumberDevApi(): Plugin {
  return {
    name: 'faa-nnumber-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/faa-nnumber')) {
          next();
          return;
        }
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }
        try {
          const params = new URL(url, 'http://vite.local').searchParams;
          const raw = params.get('n') ?? '';
          if (!parseTailForFaaQuery(raw)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Provide a valid N-number (e.g. N12345 or 12345).' }));
            return;
          }
          const data = await lookupFaaRegistryByNNumber(raw);
          res.setHeader('Content-Type', 'application/json');
          if (!data) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'No aircraft found for that N-number in the FAA registry.' }));
            return;
          }
          res.statusCode = 200;
          res.end(JSON.stringify({ aircraft: data, fetchedAt: new Date().toISOString() }));
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Lookup failed';
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), faaNNumberDevApi()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('pdfjs-dist') || id.includes('pdf-lib') || id.includes('mammoth') || id.includes('docx')) {
            return;
          }
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-')) {
            return;
          }
          if (id.includes('@clerk')) {
            return 'vendor-auth';
          }
          if (id.includes('convex')) {
            return 'vendor-convex';
          }
          return;
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    https: true, // avoids "not secure" for sign-in (localhost uses self-signed cert)
  },
});
