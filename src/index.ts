import { scanFiles } from './scanner.js';
import { classifyFile } from './classifier.js';
import { analyzeFile } from './engine.js';
import { computeScore } from './scorer.js';
import { loadConfig } from './config.js';
import { allRules } from './rules/index.js';
import { applyFixes } from './fixer.js';
import { setSvelteCompilerRoot } from './parsers/svelte.js';
import type { Diagnostic, DiagnoseResult, FileRole, SvelteDoctorConfig } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiagnoseOptions {
  fix?: boolean;
  config?: SvelteDoctorConfig;
  ignoreRules?: string[];
  confirmFix?: (fixableCount: number) => Promise<boolean>;
}

export async function diagnose(
  projectRoot: string,
  options: DiagnoseOptions = {}
): Promise<DiagnoseResult> {
  const resolvedRoot = path.resolve(projectRoot);
  setSvelteCompilerRoot(resolvedRoot);
  const config = options.config ?? loadConfig(resolvedRoot);

  // Merge ignored rules from config and options
  const ignoredRules = new Set([
    ...(config.ignore?.rules ?? []),
    ...(options.ignoreRules ?? []),
  ]);

  const rules = allRules.filter((r) => !ignoredRules.has(r.id));

  // Scan files
  const filePaths = await scanFiles(resolvedRoot, config);

  // First pass: analyze each file and collect diagnostics
  const fileResults: Array<{
    filePath: string;
    relativePath: string;
    fileRole: FileRole;
    source: string;
    diagnostics: Diagnostic[];
  }> = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(resolvedRoot, filePath);
    const fileRole = classifyFile(relativePath);
    const source = fs.readFileSync(filePath, 'utf-8');

    const diagnostics = analyzeFile({
      filePath: relativePath,
      fileRole,
      source,
      rules,
    });

    fileResults.push({ filePath, relativePath, fileRole, source, diagnostics });
  }

  const allDiagnostics: Diagnostic[] = [];

  // Apply fixes if requested
  const fixableCount = fileResults.reduce(
    (sum, fr) => sum + fr.diagnostics.filter((d) => d.fixable).length,
    0
  );

  let fixesApplied = false;

  if (options.fix && fixableCount > 0) {
    const confirmed = options.confirmFix
      ? await options.confirmFix(fixableCount)
      : true;

    if (confirmed) {
      fixesApplied = true;
      for (const fr of fileResults) {
        if (fr.diagnostics.some((d) => d.fixable)) {
          const fixed = applyFixes(fr.source, fr.diagnostics, rules);
          if (fixed !== fr.source) {
            fs.writeFileSync(fr.filePath, fixed, 'utf-8');
            // Re-analyze to get remaining diagnostics
            const remainingDiagnostics = analyzeFile({
              filePath: fr.relativePath,
              fileRole: fr.fileRole,
              source: fixed,
              rules,
            });
            allDiagnostics.push(...remainingDiagnostics);
            continue;
          }
        }
        allDiagnostics.push(...fr.diagnostics);
      }
    }
  }

  if (!fixesApplied) {
    for (const fr of fileResults) {
      allDiagnostics.push(...fr.diagnostics);
    }
  }

  const score = computeScore(allDiagnostics);

  return {
    score,
    diagnostics: allDiagnostics,
    filesScanned: filePaths.length,
  };
}
