import { defineConfig } from 'vite';

const apiTarget = process.env.MULTIPASS_API_TARGET || 'http://127.0.0.1:8787';
const base = process.env.MULTIPASS_BASE || '/';

export default defineConfig({
  base,
  server: {
    host: '127.0.0.1',
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/multipass-api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/multipass-api/, ''),
      },
    },
  },
});
