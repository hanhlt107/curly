import { build } from 'vite';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const ssrOutDir = resolve(root, 'dist-ssr');

await build({
  base: '/curly/',
  plugins: [react()],
  logLevel: 'warn',
  build: {
    ssr: resolve(root, 'src/prerender.tsx'),
    outDir: ssrOutDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'prerender.mjs' } },
  },
});

const { render } = await import(pathToFileURL(resolve(ssrOutDir, 'prerender.mjs')).href);
const html = render();

const indexPath = resolve(root, 'dist/index.html');
const source = readFileSync(indexPath, 'utf-8');
const injected = source.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

if (injected === source) {
  throw new Error('prerender: could not find <div id="root"></div> to inject into');
}

writeFileSync(indexPath, injected);
rmSync(ssrOutDir, { recursive: true, force: true });
console.log('prerender: injected landing HTML into dist/index.html');
