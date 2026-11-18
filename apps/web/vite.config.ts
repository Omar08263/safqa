import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Emits /precache.json (every built JS/CSS chunk) so the service worker can make the whole app work offline, lazy pages included. */
function precacheManifest(): Plugin {
  return {
    name: 'safqa-precache-manifest',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => /\.(js|css|woff2?)$/.test(f)).map((f) => `/${f}`);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ builtAt: new Date().toISOString(), files }) });
    },
  };
}

const api = process.env.VITE_API_PROXY || 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheManifest()],
  server: {
    host: '0.0.0.0',
    port: 47321,
    proxy: {
      '/api': api,
      '/docs': api,
      '/openapi.json': api,
    },
  },
});
