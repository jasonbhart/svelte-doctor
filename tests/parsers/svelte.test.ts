import { describe, it, expect } from 'vitest';
import { parseSvelte } from '../../src/parsers/svelte.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('parseSvelte', () => {
  it('parses a valid Svelte 5 component', () => {
    const fixturePath = path.join(__dirname, '../fixtures/simple-component.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const ast = parseSvelte(source, fixturePath);

    expect(ast).toBeDefined();
    expect(ast.type).toBe('Root');
    expect(ast.fragment).toBeDefined();
    expect(ast.instance).toBeDefined();
  });

  it('returns null for unparseable content', () => {
    const ast = parseSvelte('<<<invalid>>>', 'bad.svelte');
    expect(ast).toBeNull();
  });
});
