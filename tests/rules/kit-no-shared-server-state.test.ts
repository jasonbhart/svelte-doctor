import { describe, it, expect } from 'vitest';
import { kitNoSharedServerState } from '../../src/rules/kit-no-shared-server-state.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(kitNoSharedServerState, 'page-server');

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
