import { describe, it, expect } from 'vitest';
import { svPreferDerivedOverEffect } from '../../src/rules/sv-prefer-derived-over-effect.js';
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
    rules: [svPreferDerivedOverEffect],
  });
}

describe('sv-prefer-derived-over-effect', () => {
  it('flags $effect that only assigns a single variable', () => {
    const diagnostics = analyzeFixture('effect-as-derived.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes clean $effect with side effects (console.log, fetch, etc.)', () => {
    const diagnostics = analyzeFixture('clean-effect.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svPreferDerivedOverEffect.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svPreferDerivedOverEffect.id).toBe('sv-prefer-derived-over-effect');
    expect(svPreferDerivedOverEffect.severity).toBe('warning');
    expect(svPreferDerivedOverEffect.applicableTo).toContain('svelte-component');
  });
});
