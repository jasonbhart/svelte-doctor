import { describe, it, expect } from 'vitest';
import { svPreferSnippets } from '../../src/rules/sv-prefer-snippets.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const analyzeFixture = createAnalyzeFixture(svPreferSnippets);

describe('sv-prefer-snippets', () => {
  it('flags <slot> elements', () => {
    const diagnostics = analyzeFixture('legacy-slot.svelte');
    expect(diagnostics.length).toBe(2); // default slot + named slot
  });

  it('passes clean snippet usage', () => {
    const diagnostics = analyzeFixture('clean-snippet.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('fixes <slot /> to {@render children?.()}', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-slot.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svPreferSnippets.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('{@render children?.()}');
    expect(fixed).toContain('{@render footer?.()}');
    expect(fixed).not.toContain('<slot');
  });

  it('fixes slot variants (single quotes, extra attrs)', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-slot-variants.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svPreferSnippets.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('{@render header?.()}');
    expect(fixed).toContain('{@render sidebar?.()}');
    // Fallback content slot is NOT fixed (too complex for regex)
    expect(fixed).toContain('<slot>fallback content</slot>');
  });
});
