import { describe, it, expect } from 'vitest';
import { diagnose } from '../../src/index.js';
import * as path from 'node:path';

const FIXTURES_ROOT = path.join(__dirname, 'fixtures');

describe('integration: full scan', () => {
  it('detects all expected violations in the fixture project', async () => {
    const result = await diagnose(FIXTURES_ROOT);

    // Should have scanned all 5 files (3 original + RunesComponent.svelte + client.ts)
    expect(result.filesScanned).toBe(5);

    // Check that expected rules fired
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));

    // Original 8 rules
    expect(ruleIds.has('sv-no-export-let')).toBe(true);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(true);
    expect(ruleIds.has('sv-require-native-events')).toBe(true);
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
    expect(ruleIds.has('kit-require-use-enhance')).toBe(true);
    expect(ruleIds.has('kit-no-shared-server-state')).toBe(true);
    expect(ruleIds.has('kit-server-only-secrets')).toBe(true);
    expect(ruleIds.has('perf-no-load-waterfalls')).toBe(true);

    // Newly covered rules (11 additional, 19 total)
    expect(ruleIds.has('sv-no-reactive-statements')).toBe(true);
    expect(ruleIds.has('sv-no-magic-props')).toBe(true);
    expect(ruleIds.has('sv-no-svelte-component')).toBe(true);
    expect(ruleIds.has('sv-no-effect-state-mutation')).toBe(true);
    expect(ruleIds.has('sv-prefer-derived-over-effect')).toBe(true);
    expect(ruleIds.has('sv-no-stale-derived-let')).toBe(true);
    expect(ruleIds.has('sv-reactivity-loss-primitive')).toBe(true);
    expect(ruleIds.has('sv-require-bindable-rune')).toBe(true);
    expect(ruleIds.has('perf-no-function-derived')).toBe(true);
    expect(ruleIds.has('perf-prefer-state-raw')).toBe(true);
    expect(ruleIds.has('sv-no-component-constructor')).toBe(true);
    expect(ruleIds.has('kit-no-goto-in-server')).toBe(true);

    // Score should be heavily degraded with this many violations
    expect(result.score.score).toBeLessThan(55);
    expect(result.score.label).toBe('Needs Work');
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
