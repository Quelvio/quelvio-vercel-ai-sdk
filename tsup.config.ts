import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node20',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  bundle: true,
  shims: false,
  treeshake: true,
  define: {
    __QUELVIO_VERCEL_AI_SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
