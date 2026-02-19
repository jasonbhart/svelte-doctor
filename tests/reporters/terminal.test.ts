import { describe, it, expect } from 'vitest';
import { formatTerminalReport } from '../../src/reporters/terminal.js';
import type { Diagnostic, ScoreResult } from '../../src/types.js';

describe('formatTerminalReport', () => {
  it('formats a report with diagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props()',
        fixable: true,
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatTerminalReport(diagnostics, score, 10, false);

    expect(output).toContain('97');
    expect(output).toContain('sv-no-export-let');
    expect(output).toContain('1 issue');
  });

  it('shows file details in verbose mode', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props()',
        fixable: true,
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatTerminalReport(diagnostics, score, 10, true);

    expect(output).toContain('src/routes/+page.svelte');
    expect(output).toContain('3:2');
  });

  it('groups by file in verbose mode', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 2,
        column: 3,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props()',
        fixable: true,
      },
      {
        ruleId: 'sv-prefer-snippets',
        severity: 'warning',
        filePath: 'src/routes/+page.svelte',
        line: 5,
        column: 1,
        message: 'Use {@render} instead of <slot>',
        agentInstruction: 'Replace slot',
        fixable: false,
      },
      {
        ruleId: 'kit-no-shared-server-state',
        severity: 'error',
        filePath: 'src/routes/+page.server.ts',
        line: 1,
        column: 1,
        message: 'Module-level let in server file',
        agentInstruction: 'Avoid shared state',
        fixable: false,
      },
    ];
    const score: ScoreResult = { score: 70, label: 'Needs Work' };
    const output = formatTerminalReport(diagnostics, score, 5, true);

    // Should contain file paths as group headers
    expect(output).toContain('src/routes/+page.svelte');
    expect(output).toContain('src/routes/+page.server.ts');
    // Should contain line:column references
    expect(output).toContain('2:3');
    expect(output).toContain('5:1');
    expect(output).toContain('1:1');
    // Should contain rule IDs
    expect(output).toContain('sv-no-export-let');
    expect(output).toContain('sv-prefer-snippets');
    expect(output).toContain('kit-no-shared-server-state');
  });

  it('handles zero diagnostics', () => {
    const score: ScoreResult = { score: 100, label: 'Excellent' };
    const output = formatTerminalReport([], score, 5, false);

    expect(output).toContain('100');
    expect(output).toContain('No issues');
  });
});
