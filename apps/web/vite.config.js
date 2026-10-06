import { defineConfig, loadEnv } from 'vite';

const REVIEWED_PRIVY_APP_ID = 'cmlv6ibdm00350el2jsm8m8s6';
const PRODUCTION_BASE = '/multipass/';

export function assertProductionBuildConfig({ command, mode, env }) {
  if (command !== 'build' || mode !== 'production') return;
  if (env.VITE_PRIVY_APP_ID !== REVIEWED_PRIVY_APP_ID) {
    throw new Error('Production build requires the reviewed VITE_PRIVY_APP_ID; refusing to disable wallet login.');
  }
  if (env.MULTIPASS_BASE !== PRODUCTION_BASE) {
    throw new Error('Production build requires MULTIPASS_BASE=/multipass/; refusing to emit broken asset routes.');
  }
}

export default defineConfig(({ command, mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  assertProductionBuildConfig({ command, mode, env });
  const apiTarget = env.MULTIPASS_API_TARGET || 'http://127.0.0.1:8787';
  const base = env.MULTIPASS_BASE || '/';

  return {
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
  };
});
