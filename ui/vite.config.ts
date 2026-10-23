import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, writeFileSync } from 'node:fs';

// L'interfaccia e' servita dal servizio come file statici (base "/").
// In sviluppo Vite gira sulla sua porta e inoltra /api al servizio su :8766.
// La destinazione si puo' cambiare con VITE_API_PROXY_TARGET.
const destinazioneApi = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8766';

// `vite build --mode demo`: la demo per GitHub Pages (servizio finto nel browser, percorsi relativi, cartella dist-demo).
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'manifest-demo',
      closeBundle() {
        if (!demo) return;
        const file = 'dist-demo/manifest.webmanifest';
        const m = JSON.parse(readFileSync(file, 'utf8')) as { start_url: string; scope: string; icons: { src: string }[] };
        m.start_url = './';
        m.scope = './';
        m.icons = m.icons.map((i) => ({ ...i, src: '.' + i.src }));
        writeFileSync(file, JSON.stringify(m, null, 2));
      },
    },
  ],
  base: demo ? './' : '/',
  build: {
    outDir: demo ? 'dist-demo' : 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: destinazioneApi,
        changeOrigin: true,
      },
    },
  },
  };
});
