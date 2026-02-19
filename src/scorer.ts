import type { Diagnostic, ScoreResult } from './types.js';

export function computeScore(diagnostics: Diagnostic[], filesScanned: number): ScoreResult {
  if (filesScanned <= 0) {
    return { score: 100, label: 'Excellent' };
  }

  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  const penalty = errors * 3 + warnings * 1;
  const density = penalty / filesScanned;
  const score = Math.round(100 * Math.exp(-3 * density));

  let label: ScoreResult['label'];
  if (score >= 90) label = 'Excellent';
  else if (score >= 75) label = 'Good';
  else if (score >= 50) label = 'Needs Work';
  else label = 'Critical';

  return { score, label };
}
