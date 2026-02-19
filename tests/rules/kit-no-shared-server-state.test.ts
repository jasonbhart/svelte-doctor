import { describe, it, expect } from 'vitest';
import { kitNoSharedServerState } from '../../src/rules/kit-no-shared-server-state.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'page-server' | 'server-endpoint') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [kitNoSharedServerState],
  });
}

describe('kit-no-shared-server-state', () => {
  it('flags module-level let declarations in server files', () => {
    const diagnostics = analyzeFixture('shared-server-state.ts', 'page-server');
    expect(diagnostics.length).toBe(2); // cache + requestCount
    expect(diagnostics[0].message).toContain('Module-level');
  });

  it('passes const declarations and function-scoped let', () => {
    const diagnostics = analyzeFixture('clean-server.ts', 'page-server');
    expect(diagnostics).toHaveLength(0);
  });
});
