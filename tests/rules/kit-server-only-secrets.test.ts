import { describe, it, expect } from 'vitest';
import { kitServerOnlySecrets } from '../../src/rules/kit-server-only-secrets.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [kitServerOnlySecrets],
  });
}

describe('kit-server-only-secrets', () => {
  it('flags $env/static/private import in client files', () => {
    const diagnostics = analyzeFixture('private-env-leak.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('$env/static/private');
  });

  it('passes $env/static/public imports', () => {
    const diagnostics = analyzeFixture('public-env.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
