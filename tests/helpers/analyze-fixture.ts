import { analyzeFile } from '../../src/engine.js';
import type { Rule, FileRole } from '../../src/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

/**
 * Factory that creates a fixture analyzer for a single rule.
 * Returns a function that reads a fixture file and runs the rule against it.
 *
 * @param rule - The rule to test
 * @param defaultFileRole - File role to use unless overridden per-call (default: 'svelte-component')
 */
export function createAnalyzeFixture(rule: Rule, defaultFileRole: FileRole = 'svelte-component') {
  return (fixtureName: string, fileRole: FileRole = defaultFileRole) => {
    const fixturePath = path.join(FIXTURES_DIR, fixtureName);
    const source = fs.readFileSync(fixturePath, 'utf-8');
    return analyzeFile({
      filePath: fixturePath,
      fileRole,
      source,
      rules: [rule],
    });
  };
}
