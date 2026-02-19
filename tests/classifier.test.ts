import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/classifier.js';

describe('classifyFile', () => {
  it('classifies .svelte files as svelte-component', () => {
    expect(classifyFile('src/routes/+page.svelte')).toBe('svelte-component');
    expect(classifyFile('src/lib/Button.svelte')).toBe('svelte-component');
  });

  it('classifies +page.server.ts as page-server', () => {
    expect(classifyFile('src/routes/+page.server.ts')).toBe('page-server');
    expect(classifyFile('src/routes/about/+page.server.js')).toBe('page-server');
  });

  it('classifies +layout.server.ts as layout-server', () => {
    expect(classifyFile('src/routes/+layout.server.ts')).toBe('layout-server');
  });

  it('classifies +server.ts as server-endpoint', () => {
    expect(classifyFile('src/routes/api/users/+server.ts')).toBe('server-endpoint');
  });

  it('classifies +page.ts as page-client', () => {
    expect(classifyFile('src/routes/+page.ts')).toBe('page-client');
  });

  it('classifies +layout.ts as layout-client', () => {
    expect(classifyFile('src/routes/+layout.ts')).toBe('layout-client');
  });

  it('classifies src/lib/server/** as lib-server', () => {
    expect(classifyFile('src/lib/server/db.ts')).toBe('lib-server');
  });

  it('classifies *.server.ts in src/lib as lib-server', () => {
    expect(classifyFile('src/lib/auth.server.ts')).toBe('lib-server');
  });

  it('classifies other src/lib files as lib-client', () => {
    expect(classifyFile('src/lib/utils.ts')).toBe('lib-client');
  });

  it('classifies svelte.config.js as config', () => {
    expect(classifyFile('svelte.config.js')).toBe('config');
    expect(classifyFile('vite.config.ts')).toBe('config');
  });
});
