import { describe, it, expect } from 'vitest';
import { kitNoGotoInServer } from '../../src/rules/kit-no-goto-in-server.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'page-server' | 'layout-server' | 'server-endpoint') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [kitNoGotoInServer],
  });
}

describe('kit-no-goto-in-server', () => {
  it('flags goto import from $app/navigation in server files', () => {
    const diagnostics = analyzeFixture('goto-in-server.ts', 'page-server');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('goto');
  });

  it('passes server file without goto', () => {
    const diagnostics = analyzeFixture('clean-redirect-server.ts', 'page-server');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(kitNoGotoInServer.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(kitNoGotoInServer.id).toBe('kit-no-goto-in-server');
    expect(kitNoGotoInServer.severity).toBe('error');
    expect(kitNoGotoInServer.applicableTo).toContain('page-server');
    expect(kitNoGotoInServer.applicableTo).toContain('layout-server');
    expect(kitNoGotoInServer.applicableTo).toContain('server-endpoint');
  });
});
