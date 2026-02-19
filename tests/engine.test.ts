import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../src/engine.js';
import type { Rule } from '../src/types.js';

const mockRule: Rule = {
  id: 'test-rule',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Test rule',
  agentPrompt: 'Fix it',
  analyze: (ast, context) => {
    // Always report one issue for testing
    context.report({ node: { start: 0, end: 1 }, message: 'test violation' });
  },
};

const mockRuleWrongRole: Rule = {
  id: 'wrong-role',
  severity: 'warning',
  applicableTo: ['page-server'],
  description: 'Should not run on components',
  agentPrompt: 'N/A',
  analyze: (_ast, context) => {
    context.report({ node: { start: 0, end: 1 }, message: 'should not appear' });
  },
};

describe('analyzeFile', () => {
  it('runs applicable rules and collects diagnostics', () => {
    const source = '<script>let x = 1;</script><p>hi</p>';
    const diagnostics = analyzeFile({
      filePath: 'src/routes/+page.svelte',
      fileRole: 'svelte-component',
      source,
      rules: [mockRule],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].ruleId).toBe('test-rule');
    expect(diagnostics[0].message).toBe('test violation');
  });

  it('skips rules that do not apply to the file role', () => {
    const source = '<script>let x = 1;</script><p>hi</p>';
    const diagnostics = analyzeFile({
      filePath: 'src/routes/+page.svelte',
      fileRole: 'svelte-component',
      source,
      rules: [mockRuleWrongRole],
    });

    expect(diagnostics).toHaveLength(0);
  });
});
