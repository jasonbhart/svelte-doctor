import { describe, it, expect } from 'vitest';
import { svNoEffectStateMutation } from '../../src/rules/sv-no-effect-state-mutation.js';
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
    rules: [svNoEffectStateMutation],
  });
}

describe('sv-no-effect-state-mutation', () => {
  it('flags $state mutation inside $effect', () => {
    const diagnostics = analyzeFixture('effect-mutation.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('$state');
    expect(diagnostics[0].message).toContain('$effect');
  });

  it('passes clean effect usage (no state mutation)', () => {
    const diagnostics = analyzeFixture('clean-effect.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoEffectStateMutation.fix).toBeUndefined();
  });
});
