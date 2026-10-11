/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Files copied as-is from public/ that the service worker should precache.
const PUBLIC_FILES = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

/* Emits sw.js from src/sw.js, with the list of built files and a version
   derived from their names (which carry content hashes). */
function serviceWorker(): Plugin {
  return {
    name: 'scrapbook-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      // .woff duplicates of the .woff2 fonts are only for old browsers, so they aren't precached.
      const files = [...Object.keys(bundle), ...PUBLIC_FILES].filter((f) => !/\.(map|woff)$/.test(f)).sort();
      const version = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [svelte(), serviceWorker()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
