import { describe, it, expect } from 'vitest';
import { svReactivityLossPrimitive } from '../../src/rules/sv-reactivity-loss-primitive.js';
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
    rules: [svReactivityLossPrimitive],
  });
}

describe('sv-reactivity-loss-primitive', () => {
  it('flags $props variable passed directly as function argument', () => {
    const diagnostics = analyzeFixture('reactivity-loss.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('reactivity');
  });

  it('passes clean derived usage', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svReactivityLossPrimitive.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svReactivityLossPrimitive.id).toBe('sv-reactivity-loss-primitive');
    expect(svReactivityLossPrimitive.severity).toBe('warning');
    expect(svReactivityLossPrimitive.applicableTo).toContain('svelte-component');
  });
});
