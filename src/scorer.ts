import type { Diagnostic, ScoreResult } from './types.js';

export function computeScore(diagnostics: Diagnostic[]): ScoreResult {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  const raw = 100 - errors * 3 - warnings * 1;
  const score = Math.max(0, Math.min(100, raw));

  let label: ScoreResult['label'];
  if (score >= 90) label = 'Excellent';
  else if (score >= 75) label = 'Good';
  else if (score >= 50) label = 'Needs Work';
  else label = 'Critical';

  return { score, label };
}
