import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/scorer.js';
import type { Diagnostic } from '../src/types.js';

function makeDiag(severity: 'error' | 'warning'): Diagnostic {
  return {
    ruleId: 'test',
    severity,
    filePath: 'test.svelte',
    line: 1,
    column: 1,
    message: 'test',
    agentInstruction: 'test',
    fixable: false,
  };
}

describe('computeScore', () => {
  it('returns 100 for no diagnostics', () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('deducts 3 per error', () => {
    const result = computeScore([makeDiag('error'), makeDiag('error')]);
    expect(result.score).toBe(94);
  });

  it('deducts 1 per warning', () => {
    const result = computeScore([makeDiag('warning'), makeDiag('warning'), makeDiag('warning')]);
    expect(result.score).toBe(97);
  });

  it('clamps to 0 minimum', () => {
    const errors = Array.from({ length: 50 }, () => makeDiag('error'));
    const result = computeScore(errors);
    expect(result.score).toBe(0);
    expect(result.label).toBe('Critical');
  });

  it('labels correctly at boundaries', () => {
    // 75 = Good (100 - (8 errors * 3) - (1 warning * 1) = 100 - 24 - 1 = 75)
    const diags = [
      ...Array.from({ length: 8 }, () => makeDiag('error')),
      makeDiag('warning'),
    ];
    expect(computeScore(diags).label).toBe('Good');
  });
});
