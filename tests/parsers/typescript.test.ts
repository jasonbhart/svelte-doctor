import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../src/parsers/typescript.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('parseTypeScript', () => {
  it('parses a valid TypeScript file', () => {
    const fixturePath = path.join(__dirname, '../fixtures/simple-module.ts');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const result = parseTypeScript(source, fixturePath);

    expect(result).toBeDefined();
    expect(result.program).toBeDefined();
    expect(result.program.type).toBe('Program');
    expect(result.errors).toHaveLength(0);
  });

  it('parses JavaScript files as well', () => {
    const source = 'const x = 1;';
    const result = parseTypeScript(source, 'test.js');

    expect(result).toBeDefined();
    expect(result.program.body.length).toBe(1);
  });
});
