import { describe, it, expect } from 'vitest';
import { svNoEffectStateMutation } from '../../src/rules/sv-no-effect-state-mutation.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoEffectStateMutation);

describe('sv-no-effect-state-mutation', () => {
  it('flags $state mutation inside $effect when read-write overlap exists', () => {
    const diagnostics = analyzeFixture('effect-read-write-loop.svelte');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('$state');
    expect(diagnostics[0].message).toContain('$effect');
  });

  it('passes clean effect usage (no state mutation)', () => {
    const diagnostics = analyzeFixture('clean-effect.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('suppresses for $bindable variable', () => {
    const diagnostics = analyzeFixture('effect-bindable-sync.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('suppresses when no read-write overlap (write-only in effect)', () => {
    const diagnostics = analyzeFixture('effect-mutation.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('suppresses for async effects', () => {
    const diagnostics = analyzeFixture('effect-async.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('suppresses for conditional assignments (guard prevents loop)', () => {
    const diagnostics = analyzeFixture('effect-conditional-reset.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('suppresses for guard clause pattern (if (var) return before write)', () => {
    const diagnostics = analyzeFixture('effect-guard-clause.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('flags UpdateExpression (count++) inside $effect as read-write loop', () => {
    const diagnostics = analyzeFixture('effect-update-expr-loop.svelte');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('count');
  });

  it('is not fixable', () => {
    expect(svNoEffectStateMutation.fix).toBeUndefined();
  });
});
