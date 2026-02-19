import { describe, it, expect } from 'vitest';
import { perfNoLoadWaterfalls } from '../../src/rules/perf-no-load-waterfalls.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(perfNoLoadWaterfalls, 'page-server');

describe('perf-no-load-waterfalls', () => {
  it('flags sequential independent awaits in load()', () => {
    const diagnostics = analyzeFixture('load-waterfall.ts');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('waterfall');
  });

  it('passes Promise.all pattern', () => {
    const diagnostics = analyzeFixture('load-parallel.ts');
    expect(diagnostics).toHaveLength(0);
  });
});
