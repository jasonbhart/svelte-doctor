import { describe, it, expect } from 'vitest';
import { formatAgentReport } from '../../src/reporters/agent.js';
import type { Diagnostic, ScoreResult } from '../../src/types.js';

describe('formatAgentReport', () => {
  it('produces valid XML with diagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props() rune instead',
        fixable: true,
        codeSnippet: 'export let name;',
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatAgentReport(diagnostics, score, 10);

    expect(output).toContain('<svelte-doctor-report');
    expect(output).toContain('score="97"');
    expect(output).toContain('label="Excellent"');
    expect(output).toContain('<issue');
    expect(output).toContain('rule="sv-no-export-let"');
    expect(output).toContain('<agent-instruction>');
    expect(output).toContain('Use $props() rune instead');
    expect(output).toContain('</svelte-doctor-report>');
  });

  it('produces valid XML with no diagnostics', () => {
    const score: ScoreResult = { score: 100, label: 'Excellent' };
    const output = formatAgentReport([], score, 5);

    expect(output).toContain('issues="0"');
    expect(output).not.toContain('<issue');
  });
});
