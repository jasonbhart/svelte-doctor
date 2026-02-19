import { describe, it, expect } from 'vitest';
import { svNoExportLet } from '../../src/rules/sv-no-export-let.js';
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
    rules: [svNoExportLet],
  });
}

describe('sv-no-export-let', () => {
  it('flags export let declarations', () => {
    const diagnostics = analyzeFixture('legacy-props.svelte');
    const propIssues = diagnostics.filter((d) => d.message.includes('export let'));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('passes clean Svelte 5 runes code', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svNoExportLet.id).toBe('sv-no-export-let');
    expect(svNoExportLet.severity).toBe('error');
    expect(svNoExportLet.applicableTo).toContain('svelte-component');
  });
});
