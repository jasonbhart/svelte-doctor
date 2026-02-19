import { describe, it, expect } from 'vitest';
import { svNoEventModifiers } from '../../src/rules/sv-no-event-modifiers.js';
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
    rules: [svNoEventModifiers],
  });
}

describe('sv-no-event-modifiers', () => {
  it('flags on:click|preventDefault modifier syntax', () => {
    const diagnostics = analyzeFixture('event-modifiers.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // click + submit with modifiers
    expect(diagnostics[0].message).toContain('modifier');
  });

  it('passes clean event syntax without modifiers', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoEventModifiers.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoEventModifiers.id).toBe('sv-no-event-modifiers');
    expect(svNoEventModifiers.severity).toBe('warning');
    expect(svNoEventModifiers.applicableTo).toContain('svelte-component');
  });
});
