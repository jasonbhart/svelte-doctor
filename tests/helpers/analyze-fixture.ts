import { analyzeFile } from '../../src/engine.js';
import type { Rule, FileRole } from '../../src/types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FIXTURES_DIR = path.join(__dirname, '../fixtures');

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
