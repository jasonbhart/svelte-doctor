import { describe, it, expect } from 'vitest';
import { svReactivityLossPrimitive } from '../../src/rules/sv-reactivity-loss-primitive.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svReactivityLossPrimitive);

describe('sv-reactivity-loss-primitive', () => {
  it('flags $props variable passed directly as function argument', () => {
    const diagnostics = analyzeFixture('reactivity-loss.svelte');
    expect(diagnostics).toHaveLength(1);
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
