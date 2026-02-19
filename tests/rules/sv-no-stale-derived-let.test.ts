import { describe, it, expect } from 'vitest';
import { svNoStaleDerivedLet } from '../../src/rules/sv-no-stale-derived-let.js';
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
    rules: [svNoStaleDerivedLet],
  });
}

describe('sv-no-stale-derived-let', () => {
  it('flags let declarations that derive from $props() variables', () => {
    const diagnostics = analyzeFixture('stale-let.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // doubled and sum
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes clean $derived usage', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svNoStaleDerivedLet.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svNoStaleDerivedLet.id).toBe('sv-no-stale-derived-let');
    expect(svNoStaleDerivedLet.severity).toBe('warning');
    expect(svNoStaleDerivedLet.applicableTo).toContain('svelte-component');
  });
});
