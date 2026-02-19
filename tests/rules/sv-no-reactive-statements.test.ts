import { describe, it, expect } from 'vitest';
import { svNoReactiveStatements } from '../../src/rules/sv-no-reactive-statements.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoReactiveStatements);

describe('sv-no-reactive-statements', () => {
  it('flags $: reactive assignment statements', () => {
    const diagnostics = analyzeFixture('legacy-reactive.svelte');
    const reactiveIssues = diagnostics.filter((d) => d.message.includes('$:'));
    expect(reactiveIssues).toHaveLength(2); // $: doubled = ... and $: { block }
  });

  it('passes clean $derived and $effect code', () => {
    const diagnostics = analyzeFixture('clean-derived.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svNoReactiveStatements.id).toBe('sv-no-reactive-statements');
    expect(svNoReactiveStatements.severity).toBe('error');
    expect(svNoReactiveStatements.applicableTo).toContain('svelte-component');
  });

  it('is fixable', () => {
    expect(svNoReactiveStatements.fix).toBeDefined();
  });

  it('fixes $: x = expr to $derived', () => {
    const source = '<script>\n  $: doubled = count * 2;\n</script>';
    const diagnostic = {
      ruleId: 'sv-no-reactive-statements',
      severity: 'error' as const,
      filePath: 'test.svelte',
      line: 2,
      column: 2,
      message: 'test',
      agentInstruction: 'test',
      fixable: true,
    };
    const result = svNoReactiveStatements.fix!(source, diagnostic);
    expect(result).toContain('$derived(');
    expect(result).not.toContain('$:');
  });
});
