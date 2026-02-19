import { describe, it, expect } from 'vitest';
import { diagnose } from '../../src/index.js';
import * as path from 'node:path';

const FIXTURES_ROOT = path.join(__dirname, 'fixtures');

describe('integration: full scan', () => {
  it('detects all expected violations in the fixture project', async () => {
    const result = await diagnose(FIXTURES_ROOT);

    // Should have scanned all 3 files
    expect(result.filesScanned).toBe(3);

    // Check that expected rules fired
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));

    expect(ruleIds.has('sv-no-export-let')).toBe(true);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(true);
    expect(ruleIds.has('sv-require-native-events')).toBe(true);
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
    expect(ruleIds.has('kit-require-use-enhance')).toBe(true);
    expect(ruleIds.has('kit-no-shared-server-state')).toBe(true);
    expect(ruleIds.has('kit-server-only-secrets')).toBe(true);
    expect(ruleIds.has('perf-no-load-waterfalls')).toBe(true);

    // Score should be degraded with this many violations
    // 6 errors * 3 + 4 warnings * 1 = 22 penalty => score 78
    // Once sv-no-reactive-statements is added (Task 23), this will drop below 75
    expect(result.score.score).toBeLessThan(80);
    expect(result.score.label).toBe('Good');
  });

  it('respects rule ignoring via config', async () => {
    const result = await diagnose(FIXTURES_ROOT, {
      ignoreRules: ['sv-no-export-let', 'sv-no-event-dispatcher'],
    });

    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds.has('sv-no-export-let')).toBe(false);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(false);
    // Other rules should still fire
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
  });
});
