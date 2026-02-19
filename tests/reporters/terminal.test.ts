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
    expect(output).toContain(':3');
  });

  it('handles zero diagnostics', () => {
    const score: ScoreResult = { score: 100, label: 'Excellent' };
    const output = formatTerminalReport([], score, 5, false);

    expect(output).toContain('100');
    expect(output).toContain('No issues');
  });
});
