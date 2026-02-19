import { describe, it, expect } from 'vitest';
import { svNoStaleDerivedLet } from '../../src/rules/sv-no-stale-derived-let.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoStaleDerivedLet);

describe('sv-no-stale-derived-let', () => {
  it('flags let declarations that derive from $props() variables', () => {
    const diagnostics = analyzeFixture('stale-let.svelte');
    expect(diagnostics).toHaveLength(2); // doubled and sum
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
