import { describe, it, expect } from 'vitest';
import { perfNoLoadWaterfalls } from '../../src/rules/perf-no-load-waterfalls.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'page-server',
    source,
    rules: [perfNoLoadWaterfalls],
  });
}

describe('perf-no-load-waterfalls', () => {
  it('flags sequential independent awaits in load()', () => {
    const diagnostics = analyzeFixture('load-waterfall.ts');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('waterfall');
  });

  it('passes Promise.all pattern', () => {
    const diagnostics = analyzeFixture('load-parallel.ts');
    expect(diagnostics).toHaveLength(0);
  });
});
