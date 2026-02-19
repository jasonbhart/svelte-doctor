import { describe, it, expect } from 'vitest';
import { kitRequireUseEnhance } from '../../src/rules/kit-require-use-enhance.js';
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
    rules: [kitRequireUseEnhance],
  });
}

describe('kit-require-use-enhance', () => {
  it('flags POST form without use:enhance', () => {
    const diagnostics = analyzeFixture('form-no-enhance.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('use:enhance');
  });

  it('passes form with use:enhance', () => {
    const diagnostics = analyzeFixture('form-with-enhance.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
