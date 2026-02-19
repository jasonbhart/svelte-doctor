import { describe, it, expect } from 'vitest';
import { svNoEffectStateMutation } from '../../src/rules/sv-no-effect-state-mutation.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoEffectStateMutation);

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
