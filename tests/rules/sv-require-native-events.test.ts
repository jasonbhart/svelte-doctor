import { describe, it, expect } from 'vitest';
import { svRequireNativeEvents } from '../../src/rules/sv-require-native-events.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svRequireNativeEvents],
  });
}

describe('sv-require-native-events', () => {
  it('flags on:click directive syntax', () => {
    const diagnostics = analyzeFixture('legacy-events.svelte');
    expect(diagnostics).toHaveLength(2); // on:click + on:keydown
    expect(diagnostics[0].message).toContain('on:');
  });

  it('flags on:event|modifier syntax with modifier-specific message', () => {
    const diagnostics = analyzeFixture('event-modifiers.svelte');
    expect(diagnostics).toHaveLength(2); // on:click|preventDefault + on:submit|preventDefault|stopPropagation
    expect(diagnostics[0].message).toContain('modifier');
    expect(diagnostics[0].message).toContain('preventDefault');
    expect(diagnostics[1].message).toContain('modifier');
  });

  it('passes modern onclick syntax', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svRequireNativeEvents.id).toBe('sv-require-native-events');
    expect(svRequireNativeEvents.severity).toBe('error');
    expect(svRequireNativeEvents.applicableTo).toContain('svelte-component');
  });
});
