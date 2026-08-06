import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2020',
  external: ['next'],
  splitting: false,
  treeshake: true,
});
