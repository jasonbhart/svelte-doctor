import { describe, it, expect } from 'vitest';
import { applyFixes } from '../src/fixer.js';
import type { Diagnostic, Rule } from '../src/types.js';

describe('applyFixes', () => {
  it('applies a simple string replacement fix', () => {
    const source = '<script>\n  export let name;\n</script>\n<p>{name}</p>';
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'test-fix',
        severity: 'error',
        filePath: 'test.svelte',
        line: 2,
        column: 2,
        message: 'test',
        agentInstruction: 'test',
        fixable: true,
      },
    ];
    const rules: Rule[] = [
      {
        id: 'test-fix',
        severity: 'error',
        applicableTo: ['svelte-component'],
        description: 'test',
        agentPrompt: 'test',
        analyze: () => {},
        fix: (src, _diag) => {
          return src.replace('export let name;', 'let { name } = $props();');
        },
      },
    ];

    const result = applyFixes(source, diagnostics, rules);
    expect(result).toContain('let { name } = $props();');
    expect(result).not.toContain('export let');
  });

  it('returns original source if no fixes apply', () => {
    const source = '<script>let x = 1;</script>';
    const result = applyFixes(source, [], []);
    expect(result).toBe(source);
  });

  it('skips non-fixable diagnostics', () => {
    const source = '<script>let x = 1;</script>';
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'no-fix',
        severity: 'error',
        filePath: 'test.svelte',
        line: 1,
        column: 1,
        message: 'test',
        agentInstruction: 'test',
        fixable: false,
      },
    ];
    const result = applyFixes(source, diagnostics, []);
    expect(result).toBe(source);
  });
});
