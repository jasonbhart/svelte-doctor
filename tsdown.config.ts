import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/cli.ts', 'src/index.ts'],
  format: 'esm',
  target: 'node18',
  dts: true,
  external: [
    'svelte',
    'svelte/compiler',
  ],
});
