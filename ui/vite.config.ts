import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// L'interfaccia e' servita dal servizio come file statici (base "/").
// In sviluppo Vite gira sulla sua porta e inoltra /api al servizio su :8766.
// La destinazione si puo' cambiare con VITE_API_PROXY_TARGET.
const destinazioneApi = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8766';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  build: {
    outDir: 'dist',
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
});
