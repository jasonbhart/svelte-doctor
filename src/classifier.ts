import type { FileRole } from './types.js';

const CONFIG_FILES = ['svelte.config.js', 'svelte.config.ts', 'vite.config.js', 'vite.config.ts'];

export function classifyFile(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';

  // Config files
  if (CONFIG_FILES.some((c) => basename === c)) {
    return 'config';
  }

  // Svelte components
  if (normalized.endsWith('.svelte')) {
    return 'svelte-component';
  }

  // SvelteKit routing files (order matters: more specific first)
  if (/\+page\.server\.[tj]s$/.test(basename)) return 'page-server';
  if (/\+layout\.server\.[tj]s$/.test(basename)) return 'layout-server';
  if (/\+server\.[tj]s$/.test(basename)) return 'server-endpoint';
  if (/\+page\.[tj]s$/.test(basename)) return 'page-client';
  if (/\+layout\.[tj]s$/.test(basename)) return 'layout-client';

  // Library server files
  if (normalized.includes('/lib/server/') || /\.server\.[tj]s$/.test(basename)) {
    return 'lib-server';
  }

  // Everything else in src/lib or elsewhere
  return 'lib-client';
}
