import { defineConfig } from 'vite';

const apiTarget = process.env.MULTIPASS_API_TARGET || 'http://127.0.0.1:8787';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/multipass-api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/multipass-api/, ''),
      },
    },
  },
});
