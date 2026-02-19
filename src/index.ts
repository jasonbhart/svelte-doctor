import { scanFiles } from './scanner.js';
import { classifyFile } from './classifier.js';
import { analyzeFile } from './engine.js';
import { computeScore } from './scorer.js';
import { loadConfig } from './config.js';
import { allRules } from './rules/index.js';
import { applyFixes } from './fixer.js';
import type { DiagnoseResult, SvelteDoctorConfig } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiagnoseOptions {
  fix?: boolean;
  config?: SvelteDoctorConfig;
  ignoreRules?: string[];
}

export async function diagnose(
  projectRoot: string,
  options: DiagnoseOptions = {}
): Promise<DiagnoseResult> {
  const resolvedRoot = path.resolve(projectRoot);
  const config = options.config ?? loadConfig(resolvedRoot);

  // Merge ignored rules from config and options
  const ignoredRules = new Set([
    ...(config.ignore?.rules ?? []),
    ...(options.ignoreRules ?? []),
  ]);

  const rules = allRules.filter((r) => !ignoredRules.has(r.id));

  // Scan files
  const filePaths = await scanFiles(resolvedRoot, config);

  // Analyze each file
  const allDiagnostics = [];

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

    // Apply fixes if requested
    if (options.fix && diagnostics.some((d) => d.fixable)) {
      const fixed = applyFixes(source, diagnostics, rules);
      if (fixed !== source) {
        fs.writeFileSync(filePath, fixed, 'utf-8');
      }
    }

    allDiagnostics.push(...diagnostics);
  }

  const score = computeScore(allDiagnostics);

  return {
    score,
    diagnostics: allDiagnostics,
    filesScanned: filePaths.length,
  };
}
