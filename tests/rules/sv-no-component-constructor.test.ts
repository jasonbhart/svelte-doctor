import { describe, it, expect } from 'vitest';
import { svNoComponentConstructor } from '../../src/rules/sv-no-component-constructor.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'svelte-component' | 'lib-client' | 'lib-server' = 'lib-client') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [svNoComponentConstructor],
  });
}

describe('sv-no-component-constructor', () => {
  it('flags new App({ target: ... }) constructor pattern', () => {
    const diagnostics = analyzeFixture('legacy-constructor.ts');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('constructor');
  });

  it('passes mount() pattern', () => {
    const diagnostics = analyzeFixture('clean-mount.ts');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoComponentConstructor.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoComponentConstructor.id).toBe('sv-no-component-constructor');
    expect(svNoComponentConstructor.severity).toBe('error');
    expect(svNoComponentConstructor.applicableTo).toContain('svelte-component');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-client');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-server');
  });
});
