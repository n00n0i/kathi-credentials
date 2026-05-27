import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
      proxy: {
      '/api/': {
        target: 'http://localhost:8124',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api\//, '/'),
      },
      '/api': {
        target: 'http://localhost:8124',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, ''),
      },
      '/health': {
        target: 'http://localhost:8124',
        changeOrigin: true,
      },
    },
  },
});