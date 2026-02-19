import type { Diagnostic, Rule } from './types.js';

export function applyFixes(
  source: string,
  diagnostics: Diagnostic[],
  rules: Rule[]
): string {
  const fixableDiags = diagnostics.filter((d) => d.fixable);
  if (fixableDiags.length === 0) return source;

  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  let result = source;

  // Group by rule to apply each rule's fix once (rules may fix multiple instances)
  const byRule = new Map<string, Diagnostic[]>();
  for (const d of fixableDiags) {
    const existing = byRule.get(d.ruleId) ?? [];
    existing.push(d);
    byRule.set(d.ruleId, existing);
  }

  for (const [ruleId, ruleDiags] of byRule) {
    const rule = ruleMap.get(ruleId);
    if (!rule?.fix) continue;

    for (const diag of ruleDiags) {
      const fixed = rule.fix(result, diag);
      if (fixed !== null) {
        result = fixed;
      }
    }
  }

  return result;
}
