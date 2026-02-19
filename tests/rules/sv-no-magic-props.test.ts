import { describe, it, expect } from 'vitest';
import { svNoMagicProps } from '../../src/rules/sv-no-magic-props.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoMagicProps);

describe('sv-no-magic-props', () => {
  it('flags $$props and $$restProps usage', () => {
    const diagnostics = analyzeFixture('magic-props.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // $$restProps + $$props
  });

  it('passes clean $props() destructuring', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svNoMagicProps.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svNoMagicProps.id).toBe('sv-no-magic-props');
    expect(svNoMagicProps.severity).toBe('error');
    expect(svNoMagicProps.applicableTo).toContain('svelte-component');
  });
});
