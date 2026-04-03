import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/dms/',
  plugins: [react()],
  resolve: {
    conditions: ['default', 'browser', 'import'],
  },
  build: {
    target: 'esnext',
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['@provablehq/wasm'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
