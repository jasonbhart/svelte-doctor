import { describe, it, expect } from 'vitest';
import { svNoComponentConstructor } from '../../src/rules/sv-no-component-constructor.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const analyzeFixture = createAnalyzeFixture(svNoComponentConstructor, 'lib-client');

describe('sv-no-component-constructor', () => {
  it('flags new App({ target: ... }) constructor pattern', () => {
    const diagnostics = analyzeFixture('legacy-constructor.ts');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].message).toContain('constructor');
  });

  it('passes mount() pattern', () => {
    const diagnostics = analyzeFixture('clean-mount.ts');
    expect(diagnostics).toHaveLength(0);
  });

  it('fixes new Component({ target }) to mount()', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-constructor.ts');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svNoComponentConstructor.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('mount(App,');
    expect(fixed).not.toContain('new App(');
    expect(fixed).toContain("import { mount } from 'svelte'");
  });

  it('has correct metadata', () => {
    expect(svNoComponentConstructor.id).toBe('sv-no-component-constructor');
    expect(svNoComponentConstructor.severity).toBe('error');
    expect(svNoComponentConstructor.applicableTo).toContain('svelte-component');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-client');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-server');
  });
});
