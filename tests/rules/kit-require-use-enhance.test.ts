import { describe, it, expect } from 'vitest';
import { kitRequireUseEnhance } from '../../src/rules/kit-require-use-enhance.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(kitRequireUseEnhance);

describe('kit-require-use-enhance', () => {
  it('flags POST form without use:enhance', () => {
    const diagnostics = analyzeFixture('form-no-enhance.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('use:enhance');
  });

  it('passes form with use:enhance', () => {
    const diagnostics = analyzeFixture('form-with-enhance.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
