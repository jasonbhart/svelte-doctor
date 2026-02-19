import { describe, it, expect } from 'vitest';
import { svNoExportLet } from '../../src/rules/sv-no-export-let.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const analyzeFixture = createAnalyzeFixture(svNoExportLet);

describe('sv-no-export-let', () => {
  it('flags export let declarations', () => {
    const diagnostics = analyzeFixture('legacy-props.svelte');
    const propIssues = diagnostics.filter((d) => d.message.includes('export let'));
    expect(propIssues).toHaveLength(2);
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

  it('fixes export let props to $props() destructuring', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-props.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svNoExportLet.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('$props()');
    expect(fixed).not.toContain('export let');
    // Should merge into single destructuring: let { name, count = 0 } = $props();
    expect(fixed).toContain('name');
    expect(fixed).toContain('count = 0');
  });

  it('fixes typed export let props to $props() destructuring', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-props-typed.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svNoExportLet.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('$props()');
    expect(fixed).not.toContain('export let');
    expect(fixed).toContain('name');
    expect(fixed).toContain('count = 0');
    expect(fixed).toContain('items = []');
  });
});
