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
    const result = computeScore([], 100);
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('returns 100 when filesScanned is 0', () => {
    const result = computeScore([], 0);
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('normalizes by file count — large project with few warnings scores well', () => {
    // 120 warnings in 1370 files: density = 120/1370 ≈ 0.0876
    // score = round(100 * e^(-3 * 0.0876)) = round(100 * 0.769) = 77
    const warnings = Array.from({ length: 120 }, () => makeDiag('warning'));
    const result = computeScore(warnings, 1370);
    expect(result.score).toBe(77);
    expect(result.label).toBe('Good');
  });

  it('penalizes small projects with many issues', () => {
    // 5 warnings in 10 files: density = 5/10 = 0.5
    // score = round(100 * e^(-3 * 0.5)) = round(100 * 0.223) = 22
    const warnings = Array.from({ length: 5 }, () => makeDiag('warning'));
    const result = computeScore(warnings, 10);
    expect(result.score).toBe(22);
    expect(result.label).toBe('Critical');
  });

  it('weights errors 3x warnings in density', () => {
    // 10 errors in 100 files: penalty = 30, density = 0.3
    // score = round(100 * e^(-3 * 0.3)) = round(100 * 0.407) = 41
    const errors = Array.from({ length: 10 }, () => makeDiag('error'));
    const result = computeScore(errors, 100);
    expect(result.score).toBe(41);
    expect(result.label).toBe('Critical');
  });

  it('labels correctly at boundaries', () => {
    // 1 warning in 30 files: density = 1/30 ≈ 0.0333 → score = round(100 * e^(-0.1)) = 90
    const result = computeScore([makeDiag('warning')], 30);
    expect(result.score).toBe(90);
    expect(result.label).toBe('Excellent');
  });

  it('approaches 0 for very high density but never goes negative', () => {
    // 100 errors in 10 files: penalty = 300, density = 30
    // score = round(100 * e^(-90)) ≈ 0
    const errors = Array.from({ length: 100 }, () => makeDiag('error'));
    const result = computeScore(errors, 10);
    expect(result.score).toBe(0);
    expect(result.label).toBe('Critical');
  });
});
