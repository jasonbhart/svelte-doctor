import type { Diagnostic, ScoreResult } from '../types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatAgentReport(
  diagnostics: Diagnostic[],
  score: ScoreResult,
  filesScanned: number
): string {
  const lines: string[] = [];

  lines.push(
    `<svelte-doctor-report score="${score.score}" label="${score.label}" files-scanned="${filesScanned}" issues="${diagnostics.length}">`
  );

  for (const d of diagnostics) {
    lines.push(
      `  <issue rule="${escapeXml(d.ruleId)}" file="${escapeXml(d.filePath)}" severity="${d.severity}" line="${d.line}" fixable="${d.fixable}">`
    );
    lines.push(`    <description>${escapeXml(d.message)}</description>`);

    if (d.codeSnippet) {
      lines.push(`    <code-snippet>${escapeXml(d.codeSnippet)}</code-snippet>`);
    }

    lines.push(`    <agent-instruction>${escapeXml(d.agentInstruction)}</agent-instruction>`);
    lines.push('  </issue>');
  }

  lines.push('</svelte-doctor-report>');

  return lines.join('\n');
}
