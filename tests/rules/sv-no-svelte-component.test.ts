import { describe, it, expect } from 'vitest';
import { svNoSvelteComponent } from '../../src/rules/sv-no-svelte-component.js';
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
    rules: [svNoSvelteComponent],
  });
}

describe('sv-no-svelte-component', () => {
  it('flags <svelte:component this={...} />', () => {
    const diagnostics = analyzeFixture('svelte-component.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('svelte:component');
  });

  it('passes clean component rendering', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoSvelteComponent.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoSvelteComponent.id).toBe('sv-no-svelte-component');
    expect(svNoSvelteComponent.severity).toBe('error');
    expect(svNoSvelteComponent.applicableTo).toContain('svelte-component');
  });
});
