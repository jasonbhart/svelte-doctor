import { describe, it, expect } from 'vitest';
import { svRequireBindableRune } from '../../src/rules/sv-require-bindable-rune.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svRequireBindableRune);

describe('sv-require-bindable-rune', () => {
  it('flags assignment to $props() variable without $bindable', () => {
    const diagnostics = analyzeFixture('prop-mutation.svelte');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('$bindable');
  });

  it('passes $bindable() props', () => {
    const diagnostics = analyzeFixture('clean-bindable.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svRequireBindableRune.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svRequireBindableRune.id).toBe('sv-require-bindable-rune');
    expect(svRequireBindableRune.severity).toBe('warning');
    expect(svRequireBindableRune.applicableTo).toContain('svelte-component');
  });
});
