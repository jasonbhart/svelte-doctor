import pc from 'picocolors';
import type { Diagnostic, ScoreResult } from '../types.js';

export function formatTerminalReport(
  diagnostics: Diagnostic[],
  score: ScoreResult,
  filesScanned: number,
  verbose: boolean
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(pc.bold('  svelte-doctor'));
  lines.push('');

  // Score
  const scoreColor =
    score.score >= 90 ? pc.green : score.score >= 75 ? pc.yellow : pc.red;
  lines.push(`  Score: ${scoreColor(pc.bold(String(score.score)))} / 100 (${score.label})`);
  lines.push(`  Files scanned: ${filesScanned}`);
  lines.push('');

  if (diagnostics.length === 0) {
    lines.push(pc.green('  No issues found!'));
    lines.push('');
    return lines.join('\n');
  }

  // Group by rule
  const byRule = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const existing = byRule.get(d.ruleId) ?? [];
    existing.push(d);
    byRule.set(d.ruleId, existing);
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  lines.push(
    `  ${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''} found: ${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
  );
  lines.push('');

  for (const [ruleId, ruleDiags] of byRule) {
    const severity = ruleDiags[0].severity;
    const icon = severity === 'error' ? pc.red('x') : pc.yellow('!');
    const fixable = ruleDiags[0].fixable ? pc.dim(' (fixable)') : '';

    lines.push(`  ${icon} ${pc.bold(ruleId)} (${ruleDiags.length})${fixable}`);

    if (verbose) {
      for (const d of ruleDiags) {
        lines.push(pc.dim(`    ${d.filePath}:${d.line} - ${d.message}`));
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
