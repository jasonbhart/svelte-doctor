import { describe, it, expect } from 'vitest';
import { perfPreferStateRaw } from '../../src/rules/perf-prefer-state-raw.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(perfPreferStateRaw);

describe('perf-prefer-state-raw', () => {
  it('flags $state() with large array or object literal', () => {
    const diagnostics = analyzeFixture('large-state.svelte');
    expect(diagnostics).toHaveLength(2); // items (>20 elements) + config (>10 properties)
  });

  it('passes small $state or $state.raw usage', () => {
    const diagnostics = analyzeFixture('clean-state-raw.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(perfPreferStateRaw.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(perfPreferStateRaw.id).toBe('perf-prefer-state-raw');
    expect(perfPreferStateRaw.severity).toBe('warning');
    expect(perfPreferStateRaw.applicableTo).toContain('svelte-component');
  });
});
