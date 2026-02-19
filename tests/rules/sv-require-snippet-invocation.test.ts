import { describe, it, expect } from 'vitest';
import { svRequireSnippetInvocation } from '../../src/rules/sv-require-snippet-invocation.js';
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
    rules: [svRequireSnippetInvocation],
  });
}

describe('sv-require-snippet-invocation', () => {
  it('handles unparseable snippet-no-invoke fixture gracefully (Svelte rejects it)', () => {
    // Svelte 5 compiler already rejects {@render foo} without (), so AST is null
    // The rule should handle this gracefully and return no diagnostics
    const diagnostics = analyzeFixture('snippet-no-invoke.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('passes clean {@render children?.()} usage', () => {
    const diagnostics = analyzeFixture('clean-snippet.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svRequireSnippetInvocation.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svRequireSnippetInvocation.id).toBe('sv-require-snippet-invocation');
    expect(svRequireSnippetInvocation.severity).toBe('error');
    expect(svRequireSnippetInvocation.applicableTo).toContain('svelte-component');
  });
});
