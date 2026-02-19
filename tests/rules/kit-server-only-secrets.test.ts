import { describe, it, expect } from 'vitest';
import { kitServerOnlySecrets } from '../../src/rules/kit-server-only-secrets.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(kitServerOnlySecrets);

describe('kit-server-only-secrets', () => {
  it('flags $env/static/private import in client files', () => {
    const diagnostics = analyzeFixture('private-env-leak.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('$env/static/private');
  });

  it('passes $env/static/public imports', () => {
    const diagnostics = analyzeFixture('public-env.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
