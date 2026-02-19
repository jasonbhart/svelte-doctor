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
    expect(diagnostics.length).toBe(2); // on:click + on:keydown
    expect(diagnostics[0].message).toContain('on:');
  });

  it('passes modern onclick syntax', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
