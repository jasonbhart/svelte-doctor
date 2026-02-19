import { describe, it, expect } from 'vitest';
import { svNoEventDispatcher } from '../../src/rules/sv-no-event-dispatcher.js';
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
    rules: [svNoEventDispatcher],
  });
}

describe('sv-no-event-dispatcher', () => {
  it('flags createEventDispatcher import', () => {
    const diagnostics = analyzeFixture('legacy-dispatcher.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('createEventDispatcher');
  });

  it('passes callback prop pattern', () => {
    const diagnostics = analyzeFixture('clean-callback-props.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
