import { describe, it, expect } from 'vitest';
import { svPreferSnippets } from '../../src/rules/sv-prefer-snippets.js';
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
    rules: [svPreferSnippets],
  });
}

describe('sv-prefer-snippets', () => {
  it('flags <slot> elements', () => {
    const diagnostics = analyzeFixture('legacy-slot.svelte');
    expect(diagnostics.length).toBe(2); // default slot + named slot
  });

  it('passes clean snippet usage', () => {
    const diagnostics = analyzeFixture('clean-snippet.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
