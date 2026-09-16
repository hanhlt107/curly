import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function pwaStub(): Plugin {
  const id = 'virtual:pwa-register/react';
  const resolved = '\0' + id;
  return {
    name: 'pwa-register-stub',
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(loadId) {
      if (loadId === resolved) {
        return `import { useState } from 'react';
export function useRegisterSW() {
  return {
    offlineReady: useState(false),
    needRefresh: useState(false),
    updateServiceWorker: () => {},
  };
}`;
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), pwaStub()],
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    target: 'es2020',
  },
});
