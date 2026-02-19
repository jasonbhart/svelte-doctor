import { describe, it, expect } from 'vitest';
import { perfNoFunctionDerived } from '../../src/rules/perf-no-function-derived.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(perfNoFunctionDerived);

describe('perf-no-function-derived', () => {
  it('flags $derived(() => expr) with arrow function expression body', () => {
    const diagnostics = analyzeFixture('function-derived.svelte');
    expect(diagnostics).toHaveLength(2); // doubled + tripled
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes $derived(expr) without wrapping arrow function', () => {
    const diagnostics = analyzeFixture('clean-derived-expr.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(perfNoFunctionDerived.fix).toBeDefined();
  });

  it('fixes $derived(() => expr) to $derived(expr)', () => {
    const source = '<script>\n  let doubled = $derived(() => count * 2);\n</script>';
    const diagnostic = {
      ruleId: 'perf-no-function-derived',
      severity: 'warning' as const,
      filePath: 'test.svelte',
      line: 2,
      column: 2,
      message: 'test',
      agentInstruction: 'test',
      fixable: true,
    };
    const result = perfNoFunctionDerived.fix!(source, diagnostic);
    expect(result).toContain('$derived(count * 2)');
    expect(result).not.toContain('=>');
  });

  it('has correct metadata', () => {
    expect(perfNoFunctionDerived.id).toBe('perf-no-function-derived');
    expect(perfNoFunctionDerived.severity).toBe('warning');
    expect(perfNoFunctionDerived.applicableTo).toContain('svelte-component');
  });
});
