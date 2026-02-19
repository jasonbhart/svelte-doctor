import { parseSvelte } from './parsers/svelte.js';
import { parseTypeScript } from './parsers/typescript.js';
import type { Rule, Diagnostic, FileRole } from './types.js';

interface AnalyzeFileOptions {
  filePath: string;
  fileRole: FileRole;
  source: string;
  rules: Rule[];
}

export function analyzeFile(options: AnalyzeFileOptions): Diagnostic[] {
  const { filePath, fileRole, source, rules } = options;
  const diagnostics: Diagnostic[] = [];

  // Filter rules applicable to this file role
  const applicableRules = rules.filter((r) => r.applicableTo.includes(fileRole));
  if (applicableRules.length === 0) return diagnostics;

  // Parse the file
  let ast: any;
  if (fileRole === 'svelte-component') {
    ast = parseSvelte(source, filePath);
  } else {
    const result = parseTypeScript(source, filePath);
    ast = result.program;
  }

  if (!ast) return diagnostics;

  // Run each applicable rule
  for (const rule of applicableRules) {
    const context = {
      filePath,
      fileRole,
      source,
      report: (info: { node: any; message: string }) => {
        const line = info.node.loc?.start?.line ?? info.node.start ?? 1;
        const column = info.node.loc?.start?.column ?? 0;

        diagnostics.push({
          ruleId: rule.id,
          severity: rule.severity,
          filePath,
          line: typeof line === 'number' && line > 0 ? line : 1,
          column: typeof column === 'number' ? column : 0,
          message: info.message,
          agentInstruction: rule.agentPrompt,
          fixable: typeof rule.fix === 'function',
        });
      },
    };

    rule.analyze(ast, context);
  }

  return diagnostics;
}
